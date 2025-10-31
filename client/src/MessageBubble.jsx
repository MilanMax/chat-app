export default function MessageBubble({
  mine,
  username,
  text,
  ts,
  isScheduled,
  deliverAt,
  scheduledDelivered
}) {
  const timeString = new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  const deliverAtString =
    deliverAt &&
    new Date(deliverAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

  let statusText = "";
  if (isScheduled && !scheduledDelivered) {
    statusText = `Scheduled for ${deliverAtString}`;
  } else if (scheduledDelivered) {
    statusText = "Delivered (scheduled)";
  }

  return (
    <div
      className={`flex flex-col ${
        mine ? "items-end" : "items-start"
      } w-full`}
    >
      {!mine && (
        <div className="text-xs text-gray-400 mb-0.5">{username}</div>
      )}
      <div
        className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
          mine
            ? "bg-bubbleSelf text-white rounded-br-none"
            : "bg-bubbleOther text-gray-100 rounded-bl-none"
        }`}
      >
        <div>{text}</div>
        <div className="text-[0.7rem] text-gray-300 mt-1 flex justify-end italic">
          {statusText || timeString}
        </div>
      </div>
    </div>
  );
}
