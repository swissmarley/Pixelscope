"""Request checks of the Lab API. Needs fastapi, pillow and httpx; no model."""
import base64
import io

from fastapi.testclient import TestClient
from PIL import Image

from lab import server

client = TestClient(server.app, base_url="http://127.0.0.1:8000")


def data_url(image, fmt="PNG", mime="image/png"):
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return f"data:{mime};base64," + base64.b64encode(buffer.getvalue()).decode()


def truncated_png():
    raw = base64.b64decode(data_url(Image.effect_noise((256, 256), 64)).split(",", 1)[1])
    return "data:image/png;base64," + base64.b64encode(raw[: len(raw) // 2]).decode()


def test_rejects_foreign_host():
    assert client.get("/health", headers={"host": "evil.example"}).status_code == 403


def test_validation_errors_name_the_field_without_echoing_input():
    secret = "do-not-echo-" + "x" * 5000
    response = client.post("/generate", json={"prompt": "x", "negative": secret, "seed": 1.5})
    assert response.status_code == 422
    body = response.json()
    assert {f["field"] for f in body["fields"]} == {"negative", "seed"}
    assert "do-not-echo" not in response.text and "1.5" not in response.text
    assert body["error"].startswith("The Lab rejected these settings")


def test_declared_oversized_body_is_refused():
    response = client.post("/generate", content=b"x" * (server.MAX_BODY_BYTES + 1), headers={"content-type": "application/json"})
    assert response.status_code == 413


def test_chunked_body_is_capped_without_content_length():
    def chunks():
        for _ in range(17):
            yield b"x" * (1024 * 1024)

    response = client.post("/generate", content=chunks(), headers={"content-type": "application/json"})
    assert response.status_code == 413
    assert response.json() == {"error": "Request exceeds 16 MB."}


def test_damaged_reference_is_refused_before_the_lock():
    # Hold the lock as a running generation would: the damaged file must still
    # get an immediate 400, not wait for the lock or reach the worker.
    assert server.lock.acquire(blocking=False)
    try:
        response = client.post("/generate", json={"prompt": "x", "reference": truncated_png()})
    finally:
        server.lock.release()
    assert response.status_code == 400
    assert response.json() == {"error": "The reference image is damaged or incomplete."}


def test_reference_checks():
    cases = {
        "data:image/png;base64," + base64.b64encode(b"hello").decode(): "not a readable",
        data_url(Image.new("RGB", (8, 8)), "GIF", "image/png"): "not a readable",
        data_url(Image.new("1", (9000, 9000))): "40 megapixels",
    }
    for reference, message in cases.items():
        response = client.post("/generate", json={"prompt": "x", "reference": reference})
        assert response.status_code == 400 and message in response.json()["error"]


def test_valid_reference_decodes():
    image = server.decode_reference(data_url(Image.new("RGB", (640, 480), "red"), "JPEG", "image/jpeg"))
    assert server.prepare_reference(image).size == (512, 512)


def test_refusals_stay_readable_by_an_allowed_page():
    origin = {"origin": "http://127.0.0.1:5173", "content-type": "application/json"}
    declared = client.post("/generate", content=b"x" * (server.MAX_BODY_BYTES + 1), headers=origin)
    chunked = client.post("/generate", content=(b"x" * (1024 * 1024) for _ in range(17)), headers=origin)
    for response in (declared, chunked):
        assert response.status_code == 413
        assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
