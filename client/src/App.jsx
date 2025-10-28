import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import ChatRoom from "./ChatRoom.jsx";
import Login from "./Login.jsx";

function ChatWrapper() {
  const { chatId } = useParams();
  const nickname = localStorage.getItem(`nickname_${chatId}`);

  if (!nickname) {
    return <Navigate to={`/login/${chatId}`} replace />;
  }

  return <ChatRoom />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/login/:chatId" element={<Login />} />
        <Route path="/chat/:chatId" element={<ChatWrapper />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
