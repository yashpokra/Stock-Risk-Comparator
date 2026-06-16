from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from stock_agent import run_multi_agent_analysis
from stocks import STOCK_OPTIONS, VALID_TICKERS


app = FastAPI(title="Financial Stock Comparison API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CompareRequest(BaseModel):
    tickers: list[str] = Field(min_length=1, max_length=6)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/stocks")
def stocks() -> dict:
    return {"stocks": STOCK_OPTIONS}


@app.post("/api/compare")
def compare(request: CompareRequest) -> dict:
    tickers = [ticker.upper().strip() for ticker in request.tickers]
    if len(set(tickers)) != len(tickers):
        raise HTTPException(status_code=400, detail="Choose unique tickers.")
    invalid = [ticker for ticker in tickers if ticker not in VALID_TICKERS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unsupported ticker(s): {', '.join(invalid)}")
    try:
        return {"reports": run_multi_agent_analysis(tickers)}
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
