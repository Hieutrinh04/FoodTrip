---
title: FoodTrip Generator
emoji: 🍜
sdk: docker
app_port: 7860
---

# FoodTrip self-hosted generator

Assemble with `scripts/prepare-generator-space.py` after training and manually reviewing `samples.json`.
The service loads `adapter/` and its pinned base Qwen model. It never calls a paid inference API.

Set `GENERATOR_TOKEN` as a server secret (24+ characters). `POST /generate` requires Bearer authentication.
`GET /` returns only model health. This process serializes generation and rejects concurrent requests as busy.
Use an HTTPS host with sufficient memory; benchmark latency on its actual hardware before connecting the website.
A CPU deployment is supported but may exceed the website's 6.5-second timeout; no latency guarantee is implied.

Website Edge Function settings: `ASSISTANT_GENERATOR_URL` and `ASSISTANT_GENERATOR_TOKEN`.
Fallback to Anthropic remains separately opt-in; leave Anthropic secrets unset to avoid paid model calls.

The training report is not a deployment approval. Check hallucinations, Vietnamese quality, policy conditions,
prompt injection, incomplete output and latency before enabling generation for users.
