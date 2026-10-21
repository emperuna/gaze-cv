# Observation settings

Baseline direction thresholds, detector tiling, image width, and approximate pose thresholds are adjustable through the supported command options. Their values are saved with outputs; the baseline down threshold was selected on Pointing04 validation data, not the locked test split.

The current [fixed-seat configuration](../data/annotations/fourpeople-seats.json) is stored beside its manually reviewed source references. It describes normalized image regions for the FourPeople proxy, not student identities or a universal classroom arrangement. Create a different configuration for a different scene; overlapping regions are rejected and ambiguous observations stay unassigned.

Optional movement rules use source time with configurable minimum duration, repetition count/window, and maximum observation gap. Saved events include the actual settings. These rules have synthetic behavior tests; real event precision/recall and ordinary-writing false alerts remain unvalidated. No smoothing is currently applied.
