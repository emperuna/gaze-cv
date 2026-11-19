# Ocular presentation runbook

Use the [12-slide PDF](ocular-final-slides.pdf). The speaking split is a proposal for the team to confirm. Keep the scripted presentation and live demonstration to 10 minutes, then allow time for questions.

| Time | Speaker and slides | What to show |
| --- | --- | --- |
| 0:00–1:00 | Marc, slides 1–2 | State the instructor's review problem, four directions and the measurable goals. |
| 1:00–3:00 | Jose, slides 3–4 | Explain subject-separated validation and test sets, the diagrams, and how the two estimators differ. |
| 3:00–5:00 | Jeremy, slides 5–7 | Show the held-out comparison, the missed speed target and one actual failure. Explain the unknown denominator and the down-to-forward error. |
| 5:00–9:00 | Everyone, slides 8–10 | Marc drives setup and processing. Jose narrates seats, event seeking and export. Jeremy runs or interprets teacher inputs. |
| 9:00–10:00 | Marc, slides 11–12 | State the limits, proposed next validation and what an alert means for an instructor. |
| After 10:00 | Everyone | Answer independently about the workflow, results and personal work. |

## Demo steps

1. Start from the prepared environment described in the [README](../../../README.md#final-presentation-build). Open `http://127.0.0.1:3000/analyze?mode=video`.
2. Choose [the two-second FourPeople clip](../../../data/samples/cp4/fourpeople-2s.webm). Open **Advanced settings** and select Baseline and two detector tiles. Check or draw the four seat regions. [Reference seat settings](../../../configs/cp4-review-baseline.json).
3. Process the recording. Play the source with overlays, inspect a seat history and any resulting movement record, and open the PDF. Reopen the completed session and show the saved observation context. If this short excerpt produces no Baseline movement event, show that result and use the recorded example to illustrate event seeking.
4. For the teacher's recording, check framing and supported constant-frame-rate format. Redraw seats for that clip if necessary. For images or mixed inputs, place supported files directly in `teacher-inputs` and run the command below. Use a new output directory for each attempt and retain unknown predictions.

```powershell
.\.venv\Scripts\python.exe scripts/run.py --input teacher-inputs --output-dir outputs/runs/teacher-demo --method baseline --tile-grid 2
```

5. If processing stalls or a classroom input cannot be opened, explain the behavior and play the [3:18 backup](../../../outputs/final/ocular-backup-demo.mp4). Use the saved-review section to show the sequence from configuring regions to reopening results.

## Questions to rehearse

- **Why is the test score lower than validation?** Development selected a baseline threshold on validation subjects. The frozen test used five different people from the same source. The comparison with the CP3 stress set is a different experiment.
- **What does the confusion matrix show?** The learned pipeline often calls down forward (14 of 30 down test images). It improves some forward/right cases and performs worse across the full test set.
- **Why also report macro F1 and coverage?** Macro F1 weights the four directions equally. Coverage tells us how often a usable direction was returned. Seven unknowns count as errors in each accuracy score.
- **What happens at twice the distance or in poor lighting?** Smaller or lower-detail detections can be missed or treated as unknown. Tiles may help in some views and increase CPU cost.
- **What is IoU used for?** Intersection over union is overlap divided by combined area. The tiled baseline uses a suppression threshold of 0.3 to remove duplicate detections across tiles.
- **What is needed before classroom use?** Representative labeled clips, an independently checked alert evaluation, physical laptop/camera throughput, permission, and an agreed plan for retained stills.

## Team rehearsal

Use the exact demo laptop, charger, projector adapter and input files. Check the complete setup before going offline, prepare the model weights and include the slide PDF and backup MP4 on USB. Confirm projector readability and practice the teacher-input and fallback paths. Test lighting and phone connection separately if showing live camera. The team records who rehearsed, hardware and the outcome after the rehearsal.
