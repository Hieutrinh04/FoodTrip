---
title: FoodTrip Assistant
emoji: 🍜
colorFrom: red
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# FoodTrip assistant — model service

Reads a message for the FoodTrip website: its **intent** (plan a trip, change a plan,
payment, refunds, tours…) and the **slots** in it (destination, days, dates, budget,
people, transport, interests, dishes, places, day of the plan). FoodTrip's Edge
Function `assistant` calls `POST /predict` with a secret token; the answer to the
user is written by FoodTrip, not by this model.

## Putting it online (done by the project owner)

1. Train on Colab (`ml/notebooks/train_assistant.ipynb`) and download
   `foodtrip-assistant-trained.zip`.
2. Assemble the Space folder:
   `node scripts/prepare-assistant-space.js path/to/foodtrip-assistant-trained.zip`
   → `ml/assistant-space/` (this README, the app, the Python code and `model/`).
3. On huggingface.co create a **Space**, SDK **Docker**, hardware **CPU basic (free)**.
   In its *Settings → Variables and secrets* add a secret **ASSISTANT_TOKEN** (a long random string).
4. Upload the folder (`git lfs install`, clone the Space, copy `ml/assistant-space/*`
   in, `git add . && git commit && git push`) — `model/model.onnx` goes through Git LFS.
5. When the Space shows *Running*, give FoodTrip its address and the same token:
   `npx supabase secrets set ASSISTANT_MODEL_URL=https://<user>-<space>.hf.space ASSISTANT_MODEL_TOKEN=<token>`

A free Space sleeps after a while without traffic; the first message after that
takes a few seconds, and FoodTrip answers with its rules meanwhile.
