# NBA Player Performance Dashboard

An interactive visualization tool for exploring NBA player statistics and performance metrics using D3.js and React.

## Demo & Documentation
- [Video Demo](https://youtu.be/aCxs2__3Fz4)
- [Project Write-Up](https://docs.google.com/document/d/11dc-Zov53iwipnd7ln8jBhzeWkZIkFC-vTJexDy1USg/edit?usp=sharing)

## Data Source
NBA player statistics sourced from [NBA Stuffer](https://www.nbastuffer.com/2024-2025-nba-player-stats/)

## Prerequisites
- Node.js (v16 or higher)
- npm (Node Package Manager)
- Modern web browser (Chrome/Firefox/Safari)

## Running the Project
1. Unzip the project files to your desired location
2. Open terminal/command prompt in the project directory and type the following:
   - npm install
   - npm run dev
5. Go to http://localhost:5173

## Project Structure
```
project_root/
├── src/
│   ├── assets/
│   │   └── react.svg
│   ├── components/
│   │   ├── ui/
│   │   │   └── card.jsx
│   │   └── PlayerDashboard.jsx   # Main dashboard component
│   ├── data/
│   │   └── nba_stats.csv
│   ├── App.css
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
├── postcss.config.js
├── tailwind.config.js
└── README.md
```

## Troubleshooting
- If you encounter module not found errors, ensure all dependencies are installed
- For CORS issues when loading data, ensure you're running from localhost
- For styling issues, verify Tailwind CSS installation
- Clear browser cache if visualizations don't update properly

## Data Format
The application expects NBA player statistics in CSV format with the following structure:
```csv
NAME,TEAM,POS,GP,MPG,PPG,RPG,APG,SPG,BPG,TPG,FG%,3P%,FT%,TS%,USG%,eFG%,VI
```