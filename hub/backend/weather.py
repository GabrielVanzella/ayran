"""Clima da Central via Open-Meteo (gratuito, sem chave).

- /api/weather?lat=&lon=   tempo agora + previsao de 7 dias + a "cena" de fundo que combina com o clima
- /api/geocode?q=          busca de cidade (pra escolher a localizacao)
"""

import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
CACHE_TTL = 15 * 60
HOT_C = 28  # a partir daqui, dia de sol vira "praia"
COLD_C = 15  # abaixo daqui, dia limpo vira "frio"

# Codigos WMO -> (descricao, grupo)
WMO = {
    0: ("Céu limpo", "limpo"), 1: ("Quase limpo", "limpo"), 2: ("Parcialmente nublado", "parcial"),
    3: ("Nublado", "nublado"), 45: ("Neblina", "neblina"), 48: ("Neblina", "neblina"),
    51: ("Garoa fraca", "chuva"), 53: ("Garoa", "chuva"), 55: ("Garoa forte", "chuva"),
    56: ("Garoa gelada", "chuva"), 57: ("Garoa gelada", "chuva"),
    61: ("Chuva fraca", "chuva"), 63: ("Chuva", "chuva"), 65: ("Chuva forte", "chuva"),
    66: ("Chuva gelada", "chuva"), 67: ("Chuva gelada", "chuva"),
    71: ("Neve fraca", "frio"), 73: ("Neve", "frio"), 75: ("Neve forte", "frio"), 77: ("Granizo fino", "frio"),
    80: ("Pancadas de chuva", "chuva"), 81: ("Pancadas de chuva", "chuva"), 82: ("Pancadas fortes", "chuva"),
    85: ("Pancadas de neve", "frio"), 86: ("Pancadas de neve", "frio"),
    95: ("Tempestade", "tempestade"), 96: ("Tempestade com granizo", "tempestade"),
    99: ("Tempestade com granizo", "tempestade"),
}


def scene_for(code: int, temp: float, is_day: bool) -> str:
    """Escolhe a cena de fundo. Chuva/tempestade/neblina ganham do resto; senao, dia ou noite + temperatura."""
    group = WMO.get(code, ("", "nublado"))[1]
    if group in ("tempestade", "chuva", "neblina"):
        return group
    if not is_day:
        return "noite"
    if group == "frio" or temp < COLD_C:
        return "frio"
    if group == "nublado":
        return "nublado"
    return "praia" if temp >= HOT_C else "sol"


def describe(code: int) -> str:
    return WMO.get(code, ("Indefinido", ""))[0]


def build_router(current_user) -> APIRouter:
    router = APIRouter(prefix="/api")
    cache: dict[tuple, tuple[float, dict]] = {}

    @router.get("/weather")
    async def weather(request: Request, lat: float, lon: float, user=Depends(current_user)):
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise HTTPException(400, "Coordenadas inválidas")
        key = (round(lat, 2), round(lon, 2))
        hit = cache.get(key)
        if hit and time.time() - hit[0] < CACHE_TTL:
            return hit[1]
        client: httpx.AsyncClient = request.app.state.http
        try:
            r = await client.get(FORECAST_URL, timeout=15, params={
                "latitude": lat, "longitude": lon, "timezone": "auto", "forecast_days": 7,
                "current": "temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m",
                "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            })
            r.raise_for_status()
            raw = r.json()
        except Exception:
            if hit:  # melhor um dado velho do que nenhum
                return hit[1]
            raise HTTPException(502, "Não consegui consultar o clima agora")

        cur, daily = raw["current"], raw["daily"]
        out = {
            "timezone": raw.get("timezone"),
            "current": {
                "temp": cur["temperature_2m"], "feels": cur["apparent_temperature"],
                "humidity": cur["relative_humidity_2m"], "wind": cur["wind_speed_10m"],
                "is_day": bool(cur["is_day"]), "code": cur["weather_code"],
                "label": describe(cur["weather_code"]),
            },
            "scene": scene_for(cur["weather_code"], cur["temperature_2m"], bool(cur["is_day"])),
            "daily": [
                {
                    "date": daily["time"][i], "code": daily["weather_code"][i], "label": describe(daily["weather_code"][i]),
                    "max": daily["temperature_2m_max"][i], "min": daily["temperature_2m_min"][i],
                    "rain": daily["precipitation_probability_max"][i],
                }
                for i in range(len(daily["time"]))
            ],
        }
        cache[key] = (time.time(), out)
        return out

    @router.get("/geocode")
    async def geocode(request: Request, q: str, user=Depends(current_user)):
        if len(q.strip()) < 2:
            return []
        client: httpx.AsyncClient = request.app.state.http
        try:
            r = await client.get(GEOCODE_URL, timeout=10,
                                 params={"name": q.strip(), "count": 6, "language": "pt", "format": "json"})
            r.raise_for_status()
        except Exception:
            raise HTTPException(502, "Não consegui buscar cidades agora")
        return [
            {
                "name": c["name"], "region": c.get("admin1", ""), "country": c.get("country", ""),
                "lat": c["latitude"], "lon": c["longitude"],
            }
            for c in r.json().get("results", [])
        ]

    return router
