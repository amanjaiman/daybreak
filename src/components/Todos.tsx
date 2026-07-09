import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Card } from "./Card";
import { CheckCircleIcon, CheckIcon } from "./icons";

type Todo = { id: string; text: string; done: boolean };

const STORAGE_KEY = "daybreak.todos";

function loadTodos(): Todo[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Todo[];
  } catch {
    return [];
  }
}

// Keep the card compact by default; long lists expand on demand.
const VISIBLE = 5;

export function Todos() {
  const [todos, setTodos] = useState<Todo[]>(loadTodos);
  const [draft, setDraft] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setTodos((t) => [{ id: crypto.randomUUID(), text, done: false }, ...t]);
    setDraft("");
  };

  const remaining = todos.filter((t) => !t.done).length;

  return (
    <Card
      title="Todos"
      icon={<CheckCircleIcon />}
      actions={
        todos.length > 0 ? (
          <span className="card__more">{remaining === 0 ? "All done" : `${remaining} left`}</span>
        ) : undefined
      }
    >
      <form className="todo__input" onSubmit={add}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a todo…"
          aria-label="Add a todo"
        />
      </form>
      {todos.length === 0 ? (
        <div className="empty">Nothing on your plate. Enjoy it.</div>
      ) : (
        <ul className="todo__list">
          {(showAll ? todos : todos.slice(0, VISIBLE)).map((todo) => (
            <li key={todo.id} className={`todo__item${todo.done ? " done" : ""}`}>
              <button
                className="todo__check"
                aria-label={todo.done ? "Mark as not done" : "Mark as done"}
                onClick={() =>
                  setTodos((all) =>
                    all.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)),
                  )
                }
              >
                <CheckIcon />
              </button>
              <span className="todo__text">{todo.text}</span>
              <button
                className="todo__del"
                aria-label="Delete todo"
                onClick={() => setTodos((all) => all.filter((t) => t.id !== todo.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {todos.length > VISIBLE && (
        <button className="list__toggle" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${todos.length}`}
        </button>
      )}
    </Card>
  );
}
