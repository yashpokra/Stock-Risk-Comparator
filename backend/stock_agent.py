import os
from typing import Any

import yfinance as yf
from dotenv import load_dotenv
from langchain_groq import ChatGroq


load_dotenv()

LLM_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def get_llm() -> ChatGroq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not set.")
    return ChatGroq(model=LLM_MODEL, api_key=api_key)


def _latest_value(frame: Any, row_name: str) -> float:
    try:
        row = frame.loc[row_name].dropna()
        return float(row.iloc[0]) if not row.empty else 0.0
    except Exception:
        return 0.0


def company_profile_tool(ticker: str) -> dict:
    """Get company name, sector, industry, and business description."""
    info = yf.Ticker(ticker).info
    return {
        "company_name": info.get("longName", ticker),
        "sector": info.get("sector", "N/A"),
        "industry": info.get("industry", "N/A"),
        "summary": info.get("longBusinessSummary", "No description available."),
    }


def _fetch_financials(ticker: str) -> dict:
    stock = yf.Ticker(ticker)
    income = stock.financials
    cashflow = stock.cashflow
    balance = stock.balance_sheet
    return {
        "revenue": _latest_value(income, "Total Revenue"),
        "net_income": _latest_value(income, "Net Income"),
        "operating_cash_flow": _latest_value(cashflow, "Operating Cash Flow"),
        "debt": _latest_value(balance, "Total Debt"),
    }


def _score_financials(financials: dict) -> dict:
    revenue = financials["revenue"]
    net_income = financials["net_income"]
    operating_cash_flow = financials["operating_cash_flow"]
    debt = financials["debt"]

    debt_ratio = min(max(debt / revenue if revenue else 2, 0), 2)
    cashflow_ratio = min(max(operating_cash_flow / net_income if net_income else 0, 0), 2)
    score = round(min(max(debt_ratio * 50 + (1 - min(cashflow_ratio, 1)) * 50, 0), 100), 2)
    level = "Low" if score < 30 else "Medium" if score < 60 else "High" if score < 80 else "Very High"
    return {"risk_score": score, "risk_level": level}


def yahoo_financial_tool(ticker: str) -> dict:
    """Fetch annual financial data for a ticker and return its credit-risk score."""
    financials = _fetch_financials(ticker)
    risk = _score_financials(financials)
    return {**financials, **risk}


def historical_trend_tool(ticker: str) -> dict:
    """Analyze 5-year stock price trend: start price, end price, growth percent."""
    hist = yf.Ticker(ticker).history(period="5y")
    if hist.empty:
        return {"start_price": 0, "end_price": 0, "growth_percent": 0}
    start = float(hist["Close"].iloc[0])
    end = float(hist["Close"].iloc[-1])
    return {
        "start_price": round(start, 2),
        "end_price": round(end, 2),
        "growth_percent": round(((end - start) / start) * 100, 2) if start else 0,
    }


def fraud_signal_tool(ticker: str) -> list[str]:
    """Detect basic financial warning signs."""
    financials = _fetch_financials(ticker)
    warnings = []
    if financials["net_income"] < 0:
        warnings.append("Negative net income")
    if financials["operating_cash_flow"] < 0:
        warnings.append("Negative operating cash flow")
    if financials["revenue"] and financials["debt"] > financials["revenue"]:
        warnings.append("Debt exceeds annual revenue")
    return warnings or ["No major warning signs detected"]


REPORT_SYSTEM_PROMPT = (
    "You are a senior investment analyst. Produce a cohesive financial risk report "
    "with exactly these numbered sections in this order: 1. Executive Summary, "
    "2. Company Overview, 3. Financial Health, 4. Historical Trend, "
    "5. Risk Classification, 6. Warning Signals, 7. Investment Perspective. "
    "Use plain text only. Do not use markdown headings, asterisks, bold markers, "
    "tables, or bullet symbols. Use only Low, Medium, High, or Very High risk labels."
)


def _format_money(value: float) -> str:
    abs_value = abs(value)
    if abs_value >= 1_000_000_000:
        return f"${value / 1_000_000_000:.2f}B"
    if abs_value >= 1_000_000:
        return f"${value / 1_000_000:.2f}M"
    return f"${value:,.0f}"


def _fallback_report(ticker: str, profile: dict, financials: dict, trend: dict, warnings: list[str]) -> str:
    warning_text = "; ".join(warnings)
    return (
        "1. Executive Summary\n"
        f"{ticker} is classified as {financials['risk_level']} risk using the available financial statement data.\n\n"
        "2. Company Overview\n"
        f"{profile['company_name']} operates in {profile['sector']} / {profile['industry']}.\n\n"
        "3. Financial Health\n"
        f"Revenue: {_format_money(financials['revenue'])}. Net income: {_format_money(financials['net_income'])}. "
        f"Operating cash flow: {_format_money(financials['operating_cash_flow'])}. Debt: {_format_money(financials['debt'])}.\n\n"
        "4. Historical Trend\n"
        f"Five-year close price moved from ${trend['start_price']} to ${trend['end_price']}, "
        f"a {trend['growth_percent']}% change.\n\n"
        "5. Risk Classification\n"
        f"Risk score: {financials['risk_score']} / 100. Risk level: {financials['risk_level']}.\n\n"
        "6. Warning Signals\n"
        f"{warning_text}\n\n"
        "7. Investment Perspective\n"
        "Use this as a screening view, then validate with current filings, valuation, and portfolio objectives."
    )


def _build_context(ticker: str) -> tuple[dict, dict, dict, list[str]]:
    return (
        company_profile_tool(ticker),
        yahoo_financial_tool(ticker),
        historical_trend_tool(ticker),
        fraud_signal_tool(ticker),
    )


def analyze_ticker(ticker: str) -> str:
    profile, financials, trend, warnings = _build_context(ticker)
    context = {
        "ticker": ticker,
        "profile": profile,
        "financials": financials,
        "trend": trend,
        "warnings": warnings,
    }
    prompt = (
        f"{REPORT_SYSTEM_PROMPT}\n\n"
        "Use only this JSON data. Do not invent missing facts.\n"
        f"{context}"
    )
    try:
        return get_llm().invoke(prompt).content
    except Exception:
        return _fallback_report(ticker, profile, financials, trend, warnings)


def compare_reports(reports: dict[str, str]) -> str:
    summaries = "\n\n".join(f"--- {ticker} ---\n{report}" for ticker, report in reports.items())
    prompt = (
        "You are a chief investment officer. Compare these company reports. "
        "Use exactly these plain-text numbered sections: "
        "1. Comparative Ranking, 2. Ranking Rationale, 3. Key Trade-Offs, "
        "4. Final Recommendation. In section 1, list each company on its own line "
        "using this format: Rank 1: Company Name - Risk level, risk score, one short reason. "
        "Use plain text only. Do not use markdown headings, asterisks, bold markers, tables, "
        "or bullet symbols. Do not say a company with a lower risk score is less stable unless "
        "the supporting financial facts justify that conclusion.\n\n"
        f"{summaries}"
    )
    try:
        return get_llm().invoke(prompt).content
    except Exception:
        return "Comparison could not be generated by the language model. Review the individual reports above."


def run_multi_agent_analysis(tickers: list[str]) -> dict:
    reports = {ticker: analyze_ticker(ticker) for ticker in tickers}
    if len(tickers) > 1:
        reports["__comparison__"] = compare_reports(reports)
    return reports
