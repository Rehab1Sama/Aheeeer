import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import { ThemeProvider } from "./components/ThemeProvider";
import "./index.css";

setAuthTokenGetter(() => localStorage.getItem("sana_auth_token"));

document.documentElement.setAttribute("dir", "rtl");
document.documentElement.setAttribute("lang", "ar");

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);

// تثبيت الموقع تطبيقًا على الجوال (إضافة إلى الشاشة الرئيسية)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
