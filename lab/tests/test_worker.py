"""Regression tests for the Lab worker with a tiny random-weight pipeline.

Needs torch, diffusers and transformers (CPU is enough). Skipped otherwise."""
import base64
import io
import queue
import threading

import pytest

torch = pytest.importorskip("torch")
pytest.importorskip("diffusers")
pytest.importorskip("transformers")

from PIL import Image  # noqa: E402

from lab import server  # noqa: E402
from lab.tests.tiny_pipeline import build_tiny_pipeline  # noqa: E402


@pytest.fixture(scope="module")
def model(tmp_path_factory):
    path = build_tiny_pipeline(str(tmp_path_factory.mktemp("tiny-sd")))
    patcher = pytest.MonkeyPatch()
    patcher.setenv("PIXELSCOPE_LAB_MODEL", path)
    server.pipelines.clear()
    yield path
    patcher.undo()
    server.pipelines.clear()


def reference_url():
    buffer = io.BytesIO()
    Image.new("RGB", (96, 64), "teal").save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def damaged_image():
    # Opens (the header is intact) but fails when decoded, as in prepare_reference.
    buffer = io.BytesIO()
    Image.effect_noise((256, 256), 64).convert("RGB").save(buffer, format="PNG")
    return Image.open(io.BytesIO(buffer.getvalue()[:400]))


def run(reference=None, image=None, before_encode=None):
    """Run the worker to completion and return its events."""
    config = server.Config(prompt="a cabin", steps=1, guidance=2, reference=reference)
    output, cancelled = queue.Queue(), threading.Event()
    if before_encode:
        original = server.prepare_reference

        def wrapped(img):
            before_encode(cancelled)
            return original(img)

        server.prepare_reference = wrapped
    assert server.lock.acquire(blocking=False), "a previous run kept the lock"
    try:
        server.generate_worker(config, image, output, cancelled)
    finally:
        if before_encode:
            server.prepare_reference = original
    events = []
    while (value := output.get_nowait()) is not None:
        events.append(value)
    return events


def assert_restored(model):
    pipe = server.pipelines[model]
    unet = pipe.unet
    assert not unet._forward_hooks and not unet._forward_pre_hooks
    assert "prepare_latents" not in vars(pipe)
    assert all(type(p).__name__ != "AttnProcessor" for p in unet.attn_processors.values())
    for _, module in unet.named_modules():
        assert "get_attention_scores" not in vars(module)


def ends_with_done(events):
    return events and events[-1].get("type") == "done"


def test_normal_damaged_reference_normal(model):
    assert ends_with_done(run())
    assert_restored(model)
    damaged = run(reference=reference_url(), image=damaged_image())
    assert "error" in damaged[-1]
    assert_restored(model)
    assert ends_with_done(run())
    assert_restored(model)


def test_normal_cancel_during_reference_encode_normal(model):
    assert ends_with_done(run())
    image = server.decode_reference(reference_url())
    cancelled_run = run(reference=reference_url(), image=image, before_encode=lambda c: c.set())
    assert not any(e.get("type") == "done" for e in cancelled_run)
    assert_restored(model)
    # A leaked stop_if_cancelled hook would make every later run fail.
    assert ends_with_done(run())
    assert_restored(model)
