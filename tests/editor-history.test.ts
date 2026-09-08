import assert from "node:assert/strict";
import test from "node:test";
import { EditorHistory } from "../src/lib/editor/history.ts";

type State = { value: number; local?: string };
const equal = (left: State, right: State) => JSON.stringify(left) === JSON.stringify(right);

test("editor history records atomic edits, clears redo, and remains bounded", () => {
  const history = new EditorHistory<State>(equal, 2);
  const initial = { value: 1 };
  const first = { value: 2 };
  const second = { value: 3 };
  const third = { value: 4 };
  assert.equal(history.record(initial, first), true);
  assert.equal(history.record(first, second), true);
  assert.deepEqual(history.undo(second), first);
  assert.deepEqual(history.redo(first), second);
  assert.equal(history.record(second, third), true);
  assert.equal(history.canRedo, false);
  assert.equal(history.snapshot().past.length, 2);
});

test("a gesture is one transaction and no-op gestures are ignored", () => {
  const history = new EditorHistory<State>(equal);
  const initial = { value: 1 };
  history.begin(initial);
  assert.equal(history.commit(initial), false);
  history.begin(initial);
  assert.equal(history.commit({ value: 54 }), true);
  assert.equal(history.snapshot().past.length, 1);
  assert.deepEqual(history.undo({ value: 54 }), initial);
});
