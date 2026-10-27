"""FoodTrip assistant on a Hugging Face Space (Docker SDK).

POST /predict {"text": "..."} → {"intent", "confidence", "intents", "slots", "tokens", "ms"}
POST /answer  {"text": "..."} → {"hits": [{"id", "score"}], "threshold", "ms"}   (when the retriever is present)
GET  /        → {"ok": true, "intents": N, "retriever": bool}

Both POSTs need  Authorization: Bearer <ASSISTANT_TOKEN>. Only FoodTrip's Edge
Function `assistant` calls them. The models read the message and find the
closest FAQ entry; the answer itself is FoodTrip's text, not generated here.
"""
import hmac
import os
import time
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from assistant_infer import Assistant, Retriever

TOKEN = os.environ.get('ASSISTANT_TOKEN', '')
if not TOKEN:
    raise SystemExit('Set the ASSISTANT_TOKEN secret in the Space settings')

model = Assistant('model')
# The answer retriever is optional: a Space can serve the intent model alone.
retriever = Retriever('retriever', 'faq_entries.jsonl') if Path('retriever/retriever.onnx').exists() else None
app = FastAPI(title='FoodTrip assistant', docs_url=None, redoc_url=None)


class Message(BaseModel):
    text: str = Field(min_length=1, max_length=600)


def authorise(header):
    if not hmac.compare_digest(header.removeprefix('Bearer ').strip(), TOKEN):
        raise HTTPException(status_code=401, detail='unauthorized')


@app.get('/')
def health():
    return {'ok': True, 'intents': len(model.intents), 'retriever': retriever is not None}


@app.post('/predict')
def predict(message: Message, authorization: str = Header(default='')):
    authorise(authorization)
    started = time.perf_counter()
    result = model.predict(message.text)
    result['ms'] = round((time.perf_counter() - started) * 1000)
    return result


@app.post('/answer')
def answer(message: Message, authorization: str = Header(default='')):
    authorise(authorization)
    if retriever is None:
        raise HTTPException(status_code=404, detail='no retriever')
    started = time.perf_counter()
    result = retriever.answer(message.text)
    result['ms'] = round((time.perf_counter() - started) * 1000)
    return result
