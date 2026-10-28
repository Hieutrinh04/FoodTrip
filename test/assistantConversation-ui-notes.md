# Manual chat checks after deployment

- Start with `mình muốn đi Đà Lạt`; answer `3`, then `2`.
  The trip card should retain Đà Lạt and show 3 days, 2 people.
- Send `đổi thành 4 ngày`; retain destination and people.
- Send `lên lịch chuyến đi mới ở Huế`; ask for days, without carrying the old trip.
- Ask `quên mật khẩu`, then `làm sao vậy?`; retain the account topic.
- Send `bạn trả lời sai rồi`; ask which part to correct.
- Trigger a request failure; one retry must not add a duplicate user message.
- Rapidly click send/suggestions; only one request should run.
- Start a request; restart and FAQ shortcuts must remain disabled until it finishes.
- With server model configured, verify Vietnamese and English answers, short references,
  correct policy conditions, and the fallback when the provider returns 429 or times out.

Automated regression coverage is in `assistantConversation.test.js`. These manual
browser and live-provider checks are a checklist, not a record of completed QA.
