"""Build a tiny random-weight Stable Diffusion pipeline offline, for tests only."""
import json
import os


def build_tiny_pipeline(out):
    import torch
    from diffusers import AutoencoderKL, EulerDiscreteScheduler, StableDiffusionPipeline, UNet2DConditionModel
    from transformers import CLIPTextConfig, CLIPTextModel, CLIPTokenizer

    os.makedirs(os.path.join(out, "tok"), exist_ok=True)
    # A character-level CLIP vocabulary, so no tokenizer download is needed.
    chars = [chr(c) for c in range(33, 127)]
    vocab = {}
    for c in chars + [c + "</w>" for c in chars] + ["<|startoftext|>", "<|endoftext|>"]:
        vocab.setdefault(c, len(vocab))
    vocab_file = os.path.join(out, "tok", "vocab.json")
    merges_file = os.path.join(out, "tok", "merges.txt")
    with open(vocab_file, "w") as f:
        json.dump(vocab, f)
    with open(merges_file, "w") as f:
        f.write("#version: 0.2\n")
    tokenizer = CLIPTokenizer(vocab_file, merges_file, model_max_length=77)
    torch.manual_seed(0)
    text_encoder = CLIPTextModel(CLIPTextConfig(
        vocab_size=len(vocab), hidden_size=32, intermediate_size=37, num_hidden_layers=2, num_attention_heads=4,
        max_position_embeddings=77, bos_token_id=vocab["<|startoftext|>"], eos_token_id=vocab["<|endoftext|>"],
        pad_token_id=vocab["<|endoftext|>"]))
    unet = UNet2DConditionModel(
        block_out_channels=(32, 64), layers_per_block=1, sample_size=32, in_channels=4, out_channels=4,
        down_block_types=("DownBlock2D", "CrossAttnDownBlock2D"), up_block_types=("CrossAttnUpBlock2D", "UpBlock2D"),
        cross_attention_dim=32, norm_num_groups=32)
    vae = AutoencoderKL(
        block_out_channels=[32, 64], in_channels=3, out_channels=3, down_block_types=["DownEncoderBlock2D"] * 2,
        up_block_types=["UpDecoderBlock2D"] * 2, latent_channels=4, norm_num_groups=32)
    StableDiffusionPipeline(
        vae=vae, text_encoder=text_encoder, tokenizer=tokenizer, unet=unet, scheduler=EulerDiscreteScheduler(),
        safety_checker=None, feature_extractor=None, requires_safety_checker=False).save_pretrained(out)
    return out
