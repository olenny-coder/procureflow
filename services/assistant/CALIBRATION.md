The three thresholds are computed from labeled samples of structured model outputs.

```bash
python services/assistant/calibration.py samples.jsonl --output thresholds.json
```

`high_min_logprob` and `mid_min_logprob` map directly to:

```env
ASSISTANT_HIGH_MIN_LOGPROB=-0.35
ASSISTANT_MID_MIN_LOGPROB=-1.0
```

Use your own documents and replay conversations; do not tune on the same sample you
use to claim quality.
