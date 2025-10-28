export default function MessageBubble({
  mine,
  username,
  text,
  ts,
  isScheduled,
  deliverAt
}) {
  const time = new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  const timeLeft = isScheduled
    ? Math.max(0, Math.round((deliverAt - Date.now()) / 60000))
    : null;

  return (
    <div className={`flex mb-2 ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow ${
          mine ? "bg-bubbleSelf text-white" : "bg-bubbleOther text-gray-100"
        } ${isScheduled ? "opacity-70" : ""} animate-fade-in`}
      >
        {!mine && (
          <div className="text-[0.7rem] font-semibold text-indigo-300 mb-1">
            {username}
          </div>
        )}

        <div className="whitespace-pre-wrap break-words flex items-center gap-1">
          {text}
          {isScheduled && (
            <span
              className="ml-1 text-[0.7rem]"
              title="Scheduled message"
              role="img"
              aria-label="clock"
            >
              ⏰
            </span>
          )}
        </div>

        <div
          className={`text-[0.6rem] mt-1 text-right ${
            mine ? "text-indigo-200" : "text-gray-400"
          }`}
        >
          {isScheduled
            ? `Scheduled${timeLeft > 0 ? ` • in ${timeLeft}m` : ""}`
            : time}
        </div>
      </div>
    </div>
  );
}
