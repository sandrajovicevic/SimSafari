// Bounded undo/redo stack. Every tool pushes an op = { label, undo(ctx), redo(ctx) } once an action
// completes (a stroke ends, a road is committed, a building is placed, ...). `undo`/`redo` on the op
// itself perform the inverse/forward mutation through the owning module's public API wherever
// possible; ops are free to mutate their own closure state (e.g. rewriting an id after a re-place)
// so repeated undo/redo cycles stay consistent.
const CAP = 64; // spec asks for >= 50

export class UndoStack {
  constructor(cap = CAP) {
    this.cap = cap;
    this._undo = [];
    this._redo = [];
  }

  push(op) {
    this._undo.push(op);
    if (this._undo.length > this.cap) this._undo.shift();
    this._redo.length = 0;
  }

  canUndo() { return this._undo.length > 0; }
  canRedo() { return this._redo.length > 0; }
  sizes() { return { undo: this._undo.length, redo: this._redo.length }; }

  undo(ctx) {
    const op = this._undo.pop();
    if (!op) return null;
    try { op.undo(ctx); } catch (err) { ctx.log.error(`[tools] undo "${op.label}" threw`, err); }
    this._redo.push(op);
    return op;
  }

  redo(ctx) {
    const op = this._redo.pop();
    if (!op) return null;
    try { op.redo(ctx); } catch (err) { ctx.log.error(`[tools] redo "${op.label}" threw`, err); }
    this._undo.push(op);
    return op;
  }

  clear() { this._undo.length = 0; this._redo.length = 0; }
}
