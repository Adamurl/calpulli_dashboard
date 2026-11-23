from typing import Literal

LogisticsRequirement = Literal[
    "nearby_parking",
    "private_changing_area",
    "audience_distance_12ft",
    "microphone_and_stand",
    "small_table",
]
LOGISTICS_LABELS: dict[LogisticsRequirement, str] = {
    "nearby_parking": "Parking close to the dance area",
    "private_changing_area": "A private dressing room or changing area",
    "audience_distance_12ft": "Allow dancers to be at least 12 feet away from audience",
    "microphone_and_stand": "1 Microphone & Stand",
    "small_table": "1 Small Table",
}
