import { useEffect, useRef, useState } from 'react';

export default function AssistantPanel({
  open,
  onClose,
  activeShift,
  data,
  ncrs,
  capas,
  anomalies,
  messages,
  onSendMessage,
  streaming
}) {
  const [inputValue, setInputValue] = useState('');
  const threadRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }, [messages]);

  const handleSend = () => {
    const nextValue = inputValue.trim();
    if (!nextValue || streaming) return;
    onSendMessage(nextValue);
    setInputValue('');
  };

  const starterChips = [
    "What's driving production loss this shift?",
    'Which machine needs attention first?',
    'How is quality trending today?'
  ];

  return (
    <aside
      id="assistant-panel"
      className={`assistant-panel ${open ? 'open' : ''}`}
      aria-hidden={!open}
    >
      <div className="assistant-header">
        <div>
          <strong>Operations AI Assistant</strong>
          <span>{activeShift} · {data?.summary?.activeAlerts ?? 0} active alert(s)</span>
        </div>
        <button type="button" className="panel-close" onClick={onClose} aria-label="Close assistant">
          x
        </button>
      </div>

      <div className="assistant-context">
        <span>{ncrs.filter((ncr) => ncr.status !== 'Closed').length} open NCRs</span>
        <span>{capas.filter((capa) => capa.status !== 'Closed').length} open CAPAs</span>
        <span>{anomalies.filter((anomaly) => !anomaly.resolved).length} active anomalies</span>
      </div>

      <div className="assistant-thread" ref={threadRef}>
        {messages.length === 0 ? (
          <div className="assistant-empty">
            <h3>Ask about the floor</h3>
            <p>Use the shortcuts below or type a question about machines, quality, alerts, or current work.</p>
            <div className="starter-chips">
              {starterChips.map((chip) => (
                <button key={chip} type="button" className="chip" onClick={() => onSendMessage(chip)}>
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`assistant-message role-${message.role}`}>
              <span className="assistant-message-role">{message.role === 'user' ? 'You' : 'Assistant'}</span>
              <p>{message.content || (message.role === 'assistant' && streaming ? 'Thinking...' : '')}</p>
            </article>
          ))
        )}
      </div>

      <div className="assistant-input-row">
        <textarea
          rows={1}
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask anything about the floor..."
          disabled={streaming}
        />
        <button type="button" className="btn-primary" onClick={handleSend} disabled={!inputValue.trim() || streaming}>
          Send
        </button>
      </div>
    </aside>
  );
}
