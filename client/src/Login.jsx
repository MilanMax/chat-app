import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function Login() {
  const [name, setName] = useState("");
  const navigate = useNavigate();
  const { chatId } = useParams();

  function handleSubmit(e) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    // Ako je konkretan chat (sa ID-jem)
    if (chatId) {
      localStorage.setItem(`nickname_${chatId}`, cleanName);
      navigate(`/chat/${chatId}`);
    } else {
      // Ako nije — kreiraj novu sobu i ime čuvaj pod novim ID-jem
      const newRoom = Math.random().toString(36).slice(2, 8);
      localStorage.setItem(`nickname_${newRoom}`, cleanName);
      navigate(`/chat/${newRoom}`);
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-800 p-6 rounded-2xl shadow-lg flex flex-col gap-3 w-80 border border-slate-700"
      >
        <h2 className="text-lg font-semibold text-center text-indigo-300">
          {chatId ? "Join Chat Room" : "Create Chat Room"}
        </h2>

        <input
          type="text"
          placeholder="Enter your nickname..."
          value={name}
          onChange={e => setName(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white outline-none text-sm focus:border-indigo-500"
        />

        <button
          type="submit"
          className="mt-2 bg-indigo-600 py-2 rounded-lg font-semibold hover:bg-indigo-500 transition"
        >
          {chatId ? "Join Chat" : "Create Chat"}
        </button>

        {chatId && (
          <p className="text-xs text-slate-400 text-center mt-2">
            You are joining existing room:{" "}
            <span className="text-indigo-300">{chatId}</span>
          </p>
        )}
      </form>
    </div>
  );
}
