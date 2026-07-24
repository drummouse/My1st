import { useMemo, useState } from 'react';

export default function LibraryOptionPicker({ kind, options = [], onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => options.filter((option) => (
    option.label.toLowerCase().includes(query.toLowerCase())
  )), [options, query]);

  return (
    <section role="dialog" aria-label={`Add ${kind}`} className="library-option-picker">
      <div className="library-option-picker-header">
        <label htmlFor="library-option-search">Search Library</label>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      <input
        id="library-option-search"
        aria-label="Search Library"
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
        value={query}
      />
      {visible.length ? (
        <div role="list" className="library-option-picker-options">
          {visible.map((option) => (
            <button
              key={`${option.source}:${option.id}`}
              role="listitem"
              type="button"
              onClick={() => onSelect(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : <p role="status">No Library options match your search.</p>}
    </section>
  );
}
