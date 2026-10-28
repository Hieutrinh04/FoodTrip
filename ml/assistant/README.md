# FoodTrip assistant — training and deployment

The assistant (chat on every page, and "Điền tự động" in the planner) reads a
message with a model trained here: its **intent** (20, see
`supabase/functions/_shared/assistant/intents.js`) and its **slots** (DEST,
DURATION, DATE, BUDGET, PEOPLE, TRANSPORT, PREF, FOOD, PLACE, DAY, tagged BIO).
FoodTrip writes every answer itself, and the itinerary is still built by the
planner's algorithm (`src/lib/itineraryEngine.js`): the model only *reads*.
Until the model is deployed, the same chat runs on rules (`rules.js`).

## Steps

| # | Step | Command / where | Who |
|---|---|---|---|
| 1 | Intents, slots, answers | `_shared/assistant/intents.js` | done |
| 2 | Generate data from templates | `node scripts/generate-assistant-dataset.js` → `data/` | done |
| 3 | Rule baseline | `node scripts/eval-assistant.js` → `data/baseline.json` | done |
| 4 | **Review the hand-written test set** | `real-test.json` (110 messages, labelled by Claude) | **you** |
| 5 | Package for Colab | `node scripts/package-assistant-colab.js` → `ml/foodtrip-assistant-colab.zip` | done |
| 6 | **Train on Colab (T4)** | `ml/notebooks/train_assistant.ipynb`, upload the zip, run every cell | **you** |
| 6b | **Answer retriever (same notebook)** | section 5b; data from `node scripts/generate-faq-dataset.js` | **you** (runs with step 6) |
| 7 | **Put the model online** | `node scripts/prepare-assistant-space.js <trained zip>`, then `space/README.md` | **you** (Hugging Face account) |
| 8 | Connect FoodTrip | `npx supabase secrets set ASSISTANT_MODEL_URL=… ASSISTANT_MODEL_TOKEN=…` | you or Claude |
| 9 | Next round | label real messages from `assistant_messages` (👍/👎 included), add them to training and to `faq.js` | later |

## Data

- `templates.js`: phrasings per intent and slot values. A template belongs to one
  split only (`i % 7`: 5 → validation, 6 → test), and test also uses destinations
  and venues never seen in training — so test measures **new phrasings**.
- Spelling variants: lower case, no accents, chat shorthand (ko, đc, vs, mk…),
  openings ("ad ơi", "cho mình hỏi") and endings.
- `real-test.json`: 110 messages written the way people type, labelled by hand.
  Fix any label you disagree with, then regenerate (step 2–5).
- Words are split by `scripts/lib/captionTokens.js` = `ml/training/ner_preprocessing.py`
  `tokenize_caption` (checked on every row by `test_assistant.py`).

## Rule baseline (2026-10-22, 20 intents)

| Set | Intent accuracy |
|---|---|
| test — unseen phrasings (585) | 76.8% |
| real_test — hand-written (110) | 76.4% |

The rules read no slots as spans; the planner's patterns (`tripRequestLocal.js`)
read the whole message instead. The trained model's report (`REPORT.md`)
shows its intent accuracy and slot F1 next to these numbers.

## Model

`vinai/phobert-base` (pinned revision) with two heads — intent from `<s>`,
BIO slot on the first piece of each syllable (`assistant_model.py`). Loss is
the sum of both cross-entropies; early stopping on the mean of validation intent
accuracy and slot F1. Exported to ONNX and checked against PyTorch
(`export-check.json`), served on CPU by `space/app.py`. FoodTrip uses the
model's reading only when its confidence is ≥ 0.6 and it answers within 6 s;
otherwise the rules answer.

Python checks run locally without a Python install through Pyodide (pure
standard-library code only); training itself needs the GPU runtime.

## Answers: FAQ retriever and computed answers

- **FAQ** (`supabase/functions/_shared/assistant/faq.js`): 49 specific answers, each with ways of asking (training), a held-out phrasing (test) and links. Add an entry whenever a real question has no good answer — the retriever finds new entries without retraining.
- **Word matching** (`faqRetrieve`, live now): test top-1 54.1%, top-3 84.7%. Answers outright only at score ≥ 0.5 (86% right there); otherwise offers "Có thể bạn muốn hỏi".
- **Trained retriever** (`train_retriever.py`): fine-tunes `bkai-foundation-models/vietnamese-bi-encoder` on (question, entry) pairs with in-batch negatives; `RETRIEVER.md` compares it with word matching and the un-tuned encoder; its threshold is chosen on `faq_validation` for 90% precision.
- **Computed** (`src/lib/assistantAnswers.js`): cost estimate, weather, a place's facts — from FoodTrip's data, for the trip being talked about.
