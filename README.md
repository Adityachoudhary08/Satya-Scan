## Project Structure
Satya-Scan
│
├── Frontend/              # React + Vite Website
├── Backend/               # Node.js + Express API
└── satyascan-extension/   # Chrome Extension (Manifest V3)

This repository contains the complete SatyaScan ecosystem, including the web application, backend API, and Chrome Extension.

# 🧩 SatyaScan Chrome Extension

The SatyaScan Chrome Extension enables real-time AI-powered fact checking directly from your browser. Verify highlighted text, analyze news articles, and access trusted evidence without leaving the webpage.

---

## ✨ Features

- 🔍 Verify highlighted text from any webpage
- 🌐 Analyze the current webpage with one click
- 🤖 AI-powered fact checking using Google Gemini
- 📚 Cross-check evidence from trusted news sources
- 📊 Trust Score & Confidence Analysis
- 📖 Transparent AI reasoning
- 🌍 English & Hindi support
- 📋 Copy verification reports
- 🔗 Share reports
- ⚡ Optimized verification with caching

---

# 🚀 Installation

## 1. Clone the repository

```bash
git clone https://github.com/pushkerWebs/Satya-Scan.git
```

## 2. Open the extension folder

```bash
cd Satya-Scan/satyascan-extension
```

## 3. Install dependencies

```bash
npm install
```

## 4. Build the extension

```bash
npm run build
```

The production build will be generated inside:

```
dist/
```

---

# 🧩 Load the Extension

1. Open Chrome.

2. Navigate to:

```
chrome://extensions
```

3. Enable **Developer Mode**.

4. Click **Load unpacked**.

5. Select:

```
Satya-Scan/
└── satyascan-extension/
    └── dist/
```

The extension will now be available in Chrome.

---

# ⚙ Backend Configuration

The extension communicates with the SatyaScan backend.

### Local Development

```
http://localhost:5000
```

### Production

Use the deployed backend URL by updating the API configuration before building.

---

# 📖 Usage

## Verify Selected Text

1. Highlight any claim on a webpage.
2. Right-click.
3. Choose **Verify with SatyaScan**.
4. Wait for AI verification.
5. Review:
   - Verdict
   - Trust Score
   - AI Summary
   - Evidence
   - Sources

---

## Language Support

Use the **EN / HI** toggle to switch languages.

The extension supports:

- UI translation
- AI explanations
- Verification summaries
- Evidence reasoning
- Source analysis

---

# 🛠 Tech Stack

- React
- Vite
- Tailwind CSS
- Chrome Extension Manifest V3
- Google Gemini API
- Node.js
- Express
- MongoDB
- Render
- Lucide React

---

# 🔐 Chrome Permissions

| Permission | Purpose |
|------------|---------|
| activeTab | Read the current webpage |
| scripting | Extract webpage content |
| contextMenus | Verify highlighted text |
| storage | Save language and preferences |
| host_permissions | Communicate with backend APIs |

---

# 📂 Folder Structure

```
satyascan-extension/
├── src/
├── public/
├── scripts/
├── shared/
├── manifest.json
├── vite.config.js
├── package.json
└── README.md
```

---

# 🧪 Development

Run the build command whenever changes are made:

```bash
npm run build
```

After rebuilding:

1. Open `chrome://extensions`
2. Click **Reload** on the SatyaScan extension
3. Test the updated functionality

---

# 🤝 Contributing

Contributions, issues, and feature requests are welcome. Feel free to fork the repository and submit a pull request.

---

# 📄 License

This project is licensed under the MIT License.
