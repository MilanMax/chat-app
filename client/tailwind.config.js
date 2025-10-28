/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0f172a",        // tamna pozadina
        bubbleSelf: "#4f46e5",
        bubbleOther: "#1e293b",
        inputBg: "#1e2538"
      }
    }
  },
  plugins: []
};
