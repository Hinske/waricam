# 🔒 WARICAM Implementierungs-Checkliste

**Pflicht vor JEDER Code-Änderung. Kein Feature gilt als fertig, bis alle Punkte geprüft sind.**

---

## Phase 0: ERST BESPRECHEN (vor allem anderen!)

**⚠️ KEINE Zeile Code schreiben, bevor dieser Schritt abgeschlossen ist.**

- [ ] **Plan erklären:** Was soll geändert werden? Warum? Welcher Ansatz?
- [ ] **Offene Punkte auflisten:** Wo bin ich unsicher? Welche Design-Entscheidungen gibt es?
- [ ] **Betroffene Stellen benennen:** Welche Dateien/Funktionen werden angefasst?
- [ ] **Risiken ansprechen:** Was könnte schiefgehen? Welche Seiteneffekte?
- [ ] **Auf Freigabe warten:** Erst nach Markus' OK wird implementiert.

Beispiel:
```
"Ich würde den DXF-Import als Undo-Command auf den Stack legen,
damit STRG+Z den Import rückgängig macht und der Canvas leer wird.
Alternativ: Stack bleibt nach Import leer, nur echte Aktionen werden undo-bar.
Welchen Ansatz willst du?"
```

---

## Phase 1: VOR dem Coden (Design)

### 1.1 User-Perspektive
- [ ] **"Will der User das?"** — Würde ein echter Bediener diese Funktion so benutzen?
- [ ] **"Was erwartet der User bei Undo?"** — Wenn die Aktion rückgängig gemacht wird, was soll passieren?
- [ ] **"Was ist der Schaden bei einem Bug?"** — Datenverlust? Falscher G-Code? Nur optisch?

### 1.2 Mutations-Analyse (VOLLSTÄNDIG)
- [ ] Alle Stellen auflisten, wo **Daten verändert** werden (grep nach `= `, `.push`, `.splice`, `.reverse`, `.length = 0`)
- [ ] Für JEDE Mutation prüfen: **Ist sie Undo-fähig?**
- [ ] Für JEDE Mutation prüfen: **Wird danach die UI aktualisiert?**

### 1.3 Vollständiger Pfad aufschreiben
```
User-Aktion → Event-Handler → Datenmutation → UI-Update → Undo/Redo → UI-Update
```
Alle 6 Schritte müssen benannt sein. Fehlt einer → Bug.

---

## Phase 2: Beim Coden (Implementation)

### 2.1 Undo-Pflicht
- [ ] **Jede Benutzeraktion die Daten ändert** → UndoManager Command
- [ ] **Kein direktes `contour.property = value`** ohne PropertyChangeCommand (Ausnahme: Selection/Highlight)
- [ ] **Batch-Operationen** → `beginGroup()` / `endGroup()`
- [ ] **Slider/Live-Preview** → Snapshot VOR erster Änderung, Commit NACH Release

### 2.2 UI-Refresh-Pflicht
- [ ] Nach `execute()` → `renderer.render()` + `updateContourPanel()`
- [ ] Nach `undo()` → **GLEICHER Refresh** (via `_refreshAfterUndoRedo()`)
- [ ] Nach `redo()` → **GLEICHER Refresh**
- [ ] Spezial-UI (CutOrder, OrderStats) nur wenn betroffen

### 2.3 Nicht-Undo-fähige Aktionen (Whitelist)
Diese Aktionen brauchen KEIN Undo:
- `isSelected` Toggle (reine UI-Selektion)
- Zoom, Pan, Grid Toggle (View-State)
- Step-Navigation (Wizard-State)
- Measure-Modus (temporär)

**Alles andere → Undo-Pflicht!**

---

## Phase 3: NACH dem Coden (Verifikation)

### 3.1 Systematischer Grep-Test
```bash
# Finde ALLE direkten Mutations-Stellen die NICHT über UndoManager laufen:
grep -n "\.cuttingMode\s*=\|\.quality\s*=\|\.kerfWidth\s*=\|\.isReference\s*=\|\.leadIn" app.js | grep -v "undoManager\|oldValue\|newValue\|snapshot\|vals\."
```
→ Jeder Treffer der nicht in einem UndoManager-Kontext steht = potentieller Bug.

### 3.2 Console-Log Verifikation
Nach jeder Benutzeraktion MUSS in der Console erscheinen:
- `[UndoManager V1.0] Ausgeführt: "..."` oder
- `[UndoManager V1.0] Gruppe: "..." (N Schritte)` oder
- `[UndoManager V1.0] ... registriert (...)`

Fehlt die Meldung → Aktion ist nicht undo-fähig → Bug.

### 3.3 Undo-Roundtrip-Test
Für JEDE neue Aktion:
1. Aktion ausführen → Canvas prüfen (visuell korrekt?)
2. STRG+Z → Canvas prüfen (zurück zum Originalzustand?)
3. STRG+Y → Canvas prüfen (wieder wie nach Aktion?)

### 3.4 Cache-Busting
- [ ] `?v=` Parameter in `index.html` hochgezählt
- [ ] Nach Deploy: Console-Zeilennummern mit Datei-Zeilen vergleichen (Differenz = Cache!)

---

## Bekannte Fallen (aus Erfahrung)

| Falle | Symptom | Lösung |
|-------|---------|--------|
| Browser-Cache | Code geändert, Verhalten gleich | Cache-Busting `?v=` hochzählen |
| PropertyChange ohne Render | Wert korrekt, UI zeigt alten Stand | `_refreshAfterUndoRedo()` nach undo/redo |
| Slider ohne Snapshot | Undo springt auf falschen Wert | `_captureSnapshot()` beim ersten `input`-Event |
| Import auf Undo-Stack | STRG+Z löscht alles | Import = Snapshot, NICHT Command |
| forEach ohne Group | Jede Kontur einzeln undo-bar | `beginGroup()` / `endGroup()` |
| FunctionCommand auf Stack.push | Execute wird nicht aufgerufen | Nur wenn Aktion BEREITS ausgeführt |
