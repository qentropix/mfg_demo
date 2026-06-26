import { useEffect, useRef, useState } from 'react';

export default function AssistantPanel({
  open,
  onClose,
  activeShift,
  activeTab,
  data,
  ncrs,
  capas,
  anomalies,
  messages,
  onSendMessage,
  onSubmitFeedback,
  streaming
}) {
  const [inputValue, setInputValue] = useState('');
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const [feedbackError, setFeedbackError] = useState('');
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

  const openFeedback = (message) => {
    if (!message.requestId) return;
    setFeedbackError('');
    setFeedbackDrafts((current) => ({
      ...current,
      [message.requestId]: {
        open: true,
        rating: current[message.requestId]?.rating ?? 4,
        comment: current[message.requestId]?.comment ?? '',
        correctAnswer: current[message.requestId]?.correctAnswer ?? ''
      }
    }));
  };

  const closeFeedback = (requestId) => {
    setFeedbackDrafts((current) => ({
      ...current,
      [requestId]: {
        ...(current[requestId] ?? {}),
        open: false
      }
    }));
  };

  const updateDraft = (requestId, patch) => {
    setFeedbackDrafts((current) => ({
      ...current,
      [requestId]: {
        open: true,
        rating: current[requestId]?.rating ?? 4,
        comment: current[requestId]?.comment ?? '',
        correctAnswer: current[requestId]?.correctAnswer ?? '',
        ...patch
      }
    }));
  };

  const submitFeedback = async (message) => {
    const draft = feedbackDrafts[message.requestId] ?? {};
    setFeedbackError('');
    try {
      await onSubmitFeedback({
        requestId: message.requestId,
        rating: draft.rating ?? 4,
        comment: draft.comment ?? '',
        correctAnswer: draft.correctAnswer ?? '',
        rawQuery: message.prompt ?? '',
        source: message.source ?? '',
        queryType: message.queryType ?? '',
        resolvedScope: message.resolvedScope ?? '',
        resolvedWindow: message.resolvedWindow ?? '',
        reaskedOrCorrected: Number(draft.rating ?? 4) <= 2 || Boolean(draft.correctAnswer),
        activeTab: message.activeTab ?? activeTab
      });
      closeFeedback(message.requestId);
    } catch (error) {
      setFeedbackError(error.message);
    }
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
              {message.role === 'assistant' && message.requestId ? (
                <div className="assistant-feedback">
                  <div className="assistant-feedback-actions">
                    <button type="button" className="chip chip-feedback" onClick={() => openFeedback(message)}>
                      Give feedback
                    </button>
                    {message.feedbackSubmitted ? <span className="assistant-feedback-sent">Feedback sent</span> : null}
                  </div>
                  {feedbackDrafts[message.requestId]?.open ? (
                    <div className="assistant-feedback-form">
                      <label className="assistant-feedback-field">
                        <span>Rating</span>
                        <select
                          value={feedbackDrafts[message.requestId]?.rating ?? 4}
                          onChange={(event) => updateDraft(message.requestId, { rating: Number(event.target.value) })}
                        >
                          <option value={5}>5 - Excellent</option>
                          <option value={4}>4 - Good</option>
                          <option value={3}>3 - Okay</option>
                          <option value={2}>2 - Off</option>
                          <option value={1}>1 - Wrong</option>
                        </select>
                      </label>
                      <label className="assistant-feedback-field">
                        <span>Comment</span>
                        <textarea
                          rows={2}
                          value={feedbackDrafts[message.requestId]?.comment ?? ''}
                          onChange={(event) => updateDraft(message.requestId, { comment: event.target.value })}
                          placeholder="What was good or what was missing?"
                        />
                      </label>
                      <label className="assistant-feedback-field">
                        <span>Correct answer</span>
                        <textarea
                          rows={2}
                          value={feedbackDrafts[message.requestId]?.correctAnswer ?? ''}
                          onChange={(event) => updateDraft(message.requestId, { correctAnswer: event.target.value })}
                          placeholder="If needed, provide the correct answer or the missing detail."
                        />
                      </label>
                      <div className="assistant-feedback-actions">
                        <button type="button" className="btn-secondary" onClick={() => closeFeedback(message.requestId)}>
                          Cancel
                        </button>
                        <button type="button" className="btn-primary" onClick={() => submitFeedback(message)}>
                          Send feedback
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
      {feedbackError ? <div className="assistant-feedback-error">{feedbackError}</div> : null}

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
