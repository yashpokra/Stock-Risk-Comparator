# Stock Risk Comparator

Full-stack app built from `Python_Code.py` for comparing 1 to 3 company stocks with a 50-stock picker.

## Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:GROQ_API_KEY = "your_groq_key"
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Frontend

```powershell
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Open `http://localhost:5173`.

The API validates that users choose 1, 2, or 3 unique tickers from `backend/stocks.py`.
