from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.presentations.schemas import PresentationSummary

ReceiptSort = Literal["received_desc", "received_asc"]


class PresentationIndex(BaseModel):
    items: list[PresentationSummary]
    limit: int
    offset: int
    total: int
    total_all: int


class StatisticSeries(BaseModel):
    key: Literal["presentations", "reviewing", "booked", "completed"]
    current: list[int] = Field(min_length=1, max_length=30)
    previous: list[int] = Field(min_length=1, max_length=30)


class PresentationStatistics(BaseModel):
    days: Literal[1, 7, 30]
    timezone: Literal["America/Los_Angeles"] = "America/Los_Angeles"
    start_date: date
    end_date: date
    metrics: list[StatisticSeries]
