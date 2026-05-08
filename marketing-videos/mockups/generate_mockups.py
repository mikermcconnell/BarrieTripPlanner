from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import math
import numpy as np
from functools import lru_cache

OUT = Path(__file__).parent
ROOT = OUT.parents[1]
S = 2
W, H = 1920 * S, 1080 * S

PALETTE = {
    "primary": "#0C8CE5",
    "primary_light": "#46B7FF",
    "primary_dark": "#005EA8",
    "secondary": "#023C69",
    "navy": "#0B214A",
    "navy_deep": "#071935",
    "ink": "#172B4D",
    "muted": "#5F6F86",
    "soft_muted": "#8C9CB1",
    "surface": "#FFFFFF",
    "surface_warm": "#FAFCFF",
    "bg": "#EAF5FF",
    "bg2": "#F7FBFF",
    "road": "#D7E1EC",
    "road_light": "#E8EEF5",
    "road_label": "#6B778C",
    "warning": "#FF991F",
    "warning_soft": "#FFF4E5",
    "error": "#DE350B",
    "error_soft": "#FFEBE6",
    "success": "#2E7D32",
    "success_soft": "#E8F5E9",
    "route": "#0C8CE5",
    "detour_outline": "#FF991F",
    "closed": "#DE350B",
    "white": "#FFFFFF",
    "black": "#091E42",
    "bay": "#D7F0FF",
}


def hx(value: str, alpha: int = 255):
    value = value.strip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def mix(a: str, b: str, t: float):
    ar, ag, ab, _ = hx(a)
    br, bg, bb, _ = hx(b)
    return (int(ar * (1 - t) + br * t), int(ag * (1 - t) + bg * t), int(ab * (1 - t) + bb * t), 255)


def sc(v: float) -> int:
    return int(round(v * S))


def box(x, y, w, h):
    return (sc(x), sc(y), sc(x + w), sc(y + h))


FONT_ROOT = ROOT / "node_modules" / "@expo-google-fonts" / "outfit"
FONT_FILES = {
    "regular": FONT_ROOT / "400Regular" / "Outfit_400Regular.ttf",
    "medium": FONT_ROOT / "500Medium" / "Outfit_500Medium.ttf",
    "semibold": FONT_ROOT / "600SemiBold" / "Outfit_600SemiBold.ttf",
    "bold": FONT_ROOT / "700Bold" / "Outfit_700Bold.ttf",
    "extrabold": FONT_ROOT / "800ExtraBold" / "Outfit_800ExtraBold.ttf",
    "black": FONT_ROOT / "900Black" / "Outfit_900Black.ttf",
}
FALLBACK_FONT_DIR = Path("C:/Windows/Fonts")


def font(size: int, weight: str = "regular"):
    requested = FONT_FILES.get(weight, FONT_FILES["regular"])
    if requested.exists():
        return ImageFont.truetype(str(requested), sc(size))
    fallback = {
        "regular": "segoeui.ttf",
        "medium": "seguisb.ttf",
        "semibold": "seguisb.ttf",
        "bold": "segoeuib.ttf",
        "extrabold": "segoeuib.ttf",
        "black": "segoeuib.ttf",
    }.get(weight, "segoeui.ttf")
    path = FALLBACK_FONT_DIR / fallback
    return ImageFont.truetype(str(path), sc(size)) if path.exists() else ImageFont.load_default()


F = {
    "eyebrow": font(18, "bold"),
    "hero": font(64, "black"),
    "hero_small": font(54, "black"),
    "subtitle": font(27, "semibold"),
    "copy": font(22, "medium"),
    "copy_regular": font(22, "regular"),
    "small": font(16, "semibold"),
    "tiny": font(13, "bold"),
    "label": font(18, "bold"),
    "phone_title": font(25, "bold"),
    "phone_h1": font(31, "bold"),
    "phone_body": font(18, "medium"),
    "phone_small": font(14, "semibold"),
    "summary": font(72, "black"),
    "summary_copy": font(30, "semibold"),
    "summary_item": font(26, "bold"),
}


def draw_text(draw: ImageDraw.ImageDraw, xy, text, fill, fnt, anchor=None, align="left"):
    draw.text((sc(xy[0]), sc(xy[1])), text, fill=hx(fill) if isinstance(fill, str) else fill, font=fnt, anchor=anchor, align=align)


def text_size(draw, value, fnt):
    b = draw.textbbox((0, 0), value, font=fnt)
    return b[2] - b[0], b[3] - b[1]


def wrapped(draw, xy, value, fill, fnt, width, line_gap=7, max_lines=None):
    words = value.split()
    lines = []
    cur = ""
    max_w = sc(width)
    for word in words:
        candidate = f"{cur} {word}".strip()
        if text_size(draw, candidate, fnt)[0] <= max_w or not cur:
            cur = candidate
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    if max_lines:
        lines = lines[:max_lines]
    x, y = sc(xy[0]), sc(xy[1])
    line_h = text_size(draw, "Ag", fnt)[1] + sc(line_gap)
    for line in lines:
        draw.text((x, y), line, fill=hx(fill) if isinstance(fill, str) else fill, font=fnt)
        y += line_h
    return y // S


def alpha_round_rect(img, rect, radius, fill, outline=None, width=1):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(tuple(sc(v) for v in rect), radius=sc(radius), fill=fill, outline=outline, width=sc(width) if outline else 1)


def shadow_card(img, rect, radius=28, fill="#FFFFFF", shadow=(9, 30, 66, 38), blur=24, offset=(0, 12), outline=None, outline_alpha=255):
    x1, y1, x2, y2 = [sc(v) for v in rect]
    shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    ox, oy = sc(offset[0]), sc(offset[1])
    sd.rounded_rectangle((x1 + ox, y1 + oy, x2 + ox, y2 + oy), radius=sc(radius), fill=shadow)
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(sc(blur)))
    img.alpha_composite(shadow_layer)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((x1, y1, x2, y2), radius=sc(radius), fill=hx(fill) if isinstance(fill, str) else fill)
    if outline:
        d.rounded_rectangle((x1, y1, x2, y2), radius=sc(radius), outline=hx(outline, outline_alpha), width=sc(1.4))


@lru_cache(maxsize=2)
def _gradient_background_base(light=True):
    if light:
        a, b, c = PALETTE["bg"], PALETTE["bg2"], "#FFFFFF"
    else:
        a, b, c = "#071935", "#0B214A", "#051226"
    xs = np.linspace(0, 1, W, dtype=np.float32)[None, :]
    ys = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    t = np.clip(xs * 0.55 + ys * 0.25, 0, 1)[..., None]
    a_rgb = np.array(hx(a)[:3], dtype=np.float32)
    b_rgb = np.array(hx(b)[:3], dtype=np.float32)
    c_rgb = np.array(hx(c)[:3], dtype=np.float32)
    base = a_rgb * (1 - t) + b_rgb * t
    c_mix = (ys * 0.26)[..., None]
    rgb = base * (1 - c_mix) + c_rgb * c_mix
    alpha = np.full((H, W, 1), 255, dtype=np.float32)
    arr = np.concatenate([rgb, alpha], axis=2).astype(np.uint8)
    img = Image.fromarray(arr)
    if light:
        glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse(box(1310, -120, 650, 650), fill=hx(PALETTE["primary_light"], 28))
        gd.ellipse(box(-210, 700, 520, 360), fill=hx(PALETTE["warning"], 22))
        glow = glow.filter(ImageFilter.GaussianBlur(sc(38)))
        img.alpha_composite(glow)
    return img


def gradient_background(light=True):
    return _gradient_background_base(light).copy()


@dataclass
class Stage:
    index: int
    title: str
    subtitle: str
    filename: str
    mode: str
    bus_pos: tuple[float, float]
    show_event: bool = False
    show_skip: bool = False
    show_detour: bool = False
    return_marker: bool = False


# Map card bounds and local map coordinate system.
MAP_CARD = (88, 214, 1054, 742)
MX, MY, MW, MH = MAP_CARD

def mp(pt):
    x, y = pt
    return sc(MX + x * MW), sc(MY + y * MH)


ROADS = [
    ((0.07, 0.16), (0.94, 0.16), 20, "Dunlop St E"),
    ((0.07, 0.39), (0.94, 0.39), 28, "Collier St"),
    ((0.07, 0.62), (0.94, 0.62), 27, "McDonald St"),
    ((0.07, 0.84), (0.94, 0.84), 19, "Worsley St"),
    ((0.23, 0.10), (0.23, 0.83), 20, "Clapperton St"),
    ((0.48, 0.08), (0.48, 0.83), 25, "Owen St"),
    ((0.66, 0.08), (0.66, 0.88), 30, "Mulcaster St"),
    ((0.82, 0.10), (0.82, 0.79), 18, "Poyntz St"),
]
NORMAL_ROUTE = [(0.66, 0.16), (0.66, 0.39), (0.66, 0.62), (0.66, 0.84)]
SKIPPED_ROUTE = [(0.66, 0.39), (0.66, 0.62)]
DETOUR_ROUTE = [(0.66, 0.39), (0.48, 0.39), (0.48, 0.62), (0.66, 0.62)]


def draw_polyline(draw, points, fill, width, joint="curve"):
    draw.line([mp(p) for p in points], fill=hx(fill) if isinstance(fill, str) else fill, width=sc(width), joint=joint)
    r = sc(width / 2)
    for x, y in [mp(p) for p in points]:
        draw.ellipse((x - r, y - r, x + r, y + r), fill=hx(fill) if isinstance(fill, str) else fill)


def draw_dashed(draw, points, fill, width, dash=28, gap=20):
    pts = [mp(p) for p in points]
    color = hx(fill) if isinstance(fill, str) else fill
    for a, b in zip(pts, pts[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        if length == 0:
            continue
        ux, uy = dx / length, dy / length
        t = 0
        while t < length:
            end = min(t + sc(dash), length)
            p1 = (a[0] + ux * t, a[1] + uy * t)
            p2 = (a[0] + ux * end, a[1] + uy * end)
            draw.line([p1, p2], fill=color, width=sc(width))
            r = sc(width / 2)
            draw.ellipse((p1[0] - r, p1[1] - r, p1[0] + r, p1[1] + r), fill=color)
            draw.ellipse((p2[0] - r, p2[1] - r, p2[0] + r, p2[1] + r), fill=color)
            t += sc(dash + gap)


def rotated_label(img, center, value, angle=0):
    tmp = Image.new("RGBA", (sc(240), sc(42)), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    td.text((sc(120), sc(21)), value, font=F["label"], fill=hx(PALETTE["road_label"], 220), anchor="mm")
    if angle:
        tmp = tmp.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
    x, y = mp(center)
    img.alpha_composite(tmp, (int(x - tmp.width / 2), int(y - tmp.height / 2)))


def route_badge(draw, xy, label, color="#0C8CE5", text_color="#FFFFFF"):
    x, y = xy
    draw.rounded_rectangle(box(x, y, 58, 34), radius=sc(17), fill=hx(color))
    draw_text(draw, (x + 29, y + 17), label, text_color, F["small"], anchor="mm")


def draw_bus(img, loc, heading="down"):
    x, y = mp(loc)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse((x - sc(44), y - sc(40), x + sc(44), y + sc(46)), fill=hx(PALETTE["primary"], 28))
    d.ellipse((x - sc(34), y + sc(32), x + sc(34), y + sc(49)), fill=(9, 30, 66, 40))
    # Vehicle body, intentionally product-style rather than cartoon.
    d.rounded_rectangle((x - sc(35), y - sc(45), x + sc(35), y + sc(35)), radius=sc(15), fill=hx(PALETTE["success"]), outline=hx(PALETTE["white"]), width=sc(5))
    d.rounded_rectangle((x - sc(25), y - sc(35), x + sc(25), y - sc(13)), radius=sc(7), fill=hx("#E7F6FF"))
    d.rounded_rectangle((x - sc(24), y - sc(7), x + sc(24), y + sc(23)), radius=sc(10), fill=hx("#0F9F69"))
    d.ellipse((x - sc(31), y + sc(25), x - sc(15), y + sc(41)), fill=hx(PALETTE["black"]))
    d.ellipse((x + sc(15), y + sc(25), x + sc(31), y + sc(41)), fill=hx(PALETTE["black"]))
    d.ellipse((x - sc(33), y + sc(6), x - sc(23), y + sc(16)), fill=hx(PALETTE["warning"]))
    d.ellipse((x + sc(23), y + sc(6), x + sc(33), y + sc(16)), fill=hx(PALETTE["warning"]))
    d.rounded_rectangle((x - sc(19), y + sc(1), x + sc(19), y + sc(25)), radius=sc(12), fill=hx(PALETTE["white"]))
    d.text((x, y + sc(13)), "11", font=F["tiny"], fill=hx(PALETTE["navy"]), anchor="mm")
    img.alpha_composite(layer)


def draw_map(img, stage: Stage):
    d = ImageDraw.Draw(img)
    shadow_card(img, MAP_CARD, radius=34, fill=PALETTE["surface_warm"], shadow=(7, 25, 55, 45), blur=28, offset=(0, 16), outline="#DCE8F3", outline_alpha=190)

    # Subtle bay / waterfront cue.
    d.pieslice((sc(MX + MW * 0.71), sc(MY + MH * 0.62), sc(MX + MW * 1.23), sc(MY + MH * 1.10)), 188, 295, fill=hx(PALETTE["bay"], 190))
    draw_text(d, (MX + MW * 0.80, MY + MH * 0.77), "Kempenfelt Bay", PALETTE["primary_dark"], F["small"])

    # Neighbourhood blocks.
    blocks = [
        (0.10, 0.20, 0.15, 0.14), (0.29, 0.20, 0.14, 0.14), (0.51, 0.20, 0.10, 0.14),
        (0.10, 0.44, 0.15, 0.12), (0.29, 0.44, 0.14, 0.12), (0.51, 0.44, 0.10, 0.12),
        (0.10, 0.67, 0.15, 0.11), (0.29, 0.67, 0.14, 0.11), (0.51, 0.67, 0.10, 0.11),
    ]
    for bx, by, bw, bh in blocks:
        d.rounded_rectangle((sc(MX + bx * MW), sc(MY + by * MH), sc(MX + (bx + bw) * MW), sc(MY + (by + bh) * MH)), radius=sc(16), fill=hx("#F1F6FB"))

    for a, b, w, _ in ROADS:
        d.line([mp(a), mp(b)], fill=hx(PALETTE["road"] if w >= 23 else PALETTE["road_light"]), width=sc(w))

    rotated_label(img, (0.87, 0.135), "Dunlop St E")
    rotated_label(img, (0.87, 0.365), "Collier St")
    rotated_label(img, (0.87, 0.595), "McDonald St")
    rotated_label(img, (0.87, 0.82), "Worsley St")
    rotated_label(img, (0.69, 0.18), "Mulcaster St", 90)
    rotated_label(img, (0.51, 0.18), "Owen St", 90)

    # Base route.
    draw_polyline(d, NORMAL_ROUTE, "#FFFFFF", 22)
    draw_polyline(d, NORMAL_ROUTE, PALETTE["route"], 13)

    if stage.show_event:
        # Closure/event zone around market near Mulcaster and Collier.
        cx, cy = mp((0.66, 0.39))
        d.rounded_rectangle((cx - sc(155), cy - sc(116), cx + sc(176), cy - sc(40)), radius=sc(22), fill=hx(PALETTE["warning_soft"], 245), outline=hx(PALETTE["warning"]), width=sc(3))
        draw_text(d, ((cx // S) - 132, (cy // S) - 98), "Farmers Market", PALETTE["navy"], F["small"])
        draw_text(d, ((cx // S) - 132, (cy // S) - 72), "closure starts", PALETTE["muted"], F["tiny"])
        d.polygon([(cx - sc(9), cy - sc(40)), (cx + sc(9), cy - sc(40)), (cx, cy - sc(20))], fill=hx(PALETTE["warning"]))
        d.rounded_rectangle((cx - sc(68), cy - sc(18), cx + sc(68), cy + sc(18)), radius=sc(18), fill=hx(PALETTE["warning"], 230))
        draw_text(d, ((cx // S), (cy // S)), "EVENT", PALETTE["navy"], F["tiny"], anchor="mm")

    if stage.show_detour:
        draw_polyline(d, DETOUR_ROUTE, PALETTE["detour_outline"], 24)
        draw_polyline(d, DETOUR_ROUTE, PALETTE["route"], 13)
        for p, label in [((0.66, 0.39), "Exit"), ((0.66, 0.62), "Return")]:
            x, y = mp(p)
            d.ellipse((x - sc(23), y - sc(23), x + sc(23), y + sc(23)), fill=hx(PALETTE["white"]), outline=hx(PALETTE["detour_outline"]), width=sc(5))
            d.ellipse((x - sc(8), y - sc(8), x + sc(8), y + sc(8)), fill=hx(PALETTE["route"]))
    if stage.show_skip:
        draw_dashed(d, SKIPPED_ROUTE, PALETTE["closed"], 19, dash=22, gap=17)

    # Map chrome and legend.
    d.rounded_rectangle(box(MX + 28, MY + 26, 210, 42), radius=sc(21), fill=hx(PALETTE["white"], 238), outline=hx("#DCE8F3"), width=sc(1))
    route_badge(d, (MX + 45, MY + 30), "11")
    draw_text(d, (MX + 118, MY + 36), "Downtown Barrie", PALETTE["ink"], F["small"])

    if stage.show_skip or stage.show_detour:
        lx, ly = MX + 34, MY + MH - 144
        shadow_card(img, (lx, ly, lx + 315, ly + 112), radius=20, fill="#FFFFFF", shadow=(7, 25, 55, 28), blur=16, offset=(0, 8), outline="#DCE8F3", outline_alpha=180)
        draw_text(d, (lx + 20, ly + 18), "Detour legend", PALETTE["ink"], F["small"])
        legend_items = [(PALETTE["route"], "Likely path buses use", True), (PALETTE["closed"], "Closed regular route", False)]
        yy = ly + 51
        for color, label, outlined in legend_items:
            if outlined:
                d.rounded_rectangle(box(lx + 20, yy + 7, 54, 8), radius=sc(4), fill=hx(PALETTE["detour_outline"]))
                d.rounded_rectangle(box(lx + 24, yy + 9, 46, 4), radius=sc(2), fill=hx(PALETTE["route"]))
            else:
                for k in range(4):
                    d.rounded_rectangle(box(lx + 20 + k * 13, yy + 8, 8, 5), radius=sc(2.5), fill=hx(color))
            draw_text(d, (lx + 88, yy), label, PALETTE["muted"], F["tiny"])
            yy += 30

    if stage.return_marker:
        x, y = mp((0.66, 0.62))
        d.rounded_rectangle((x + sc(36), y - sc(33), x + sc(208), y + sc(33)), radius=sc(20), fill=hx(PALETTE["success_soft"], 245), outline=hx(PALETTE["success"]), width=sc(3))
        draw_text(d, ((x // S) + 57, (y // S) - 11), "Back on", PALETTE["success"], F["tiny"])
        draw_text(d, ((x // S) + 57, (y // S) + 11), "regular route", PALETTE["success"], F["tiny"])

    draw_bus(img, stage.bus_pos)


def phone_screen_map(draw, x, y, w, h, mode):
    # Mini app map background.
    draw.rounded_rectangle(box(x, y, w, h), radius=sc(24), fill=hx("#F6FAFE"))
    # mini roads
    for rx in [0.24, 0.50, 0.68]:
        draw.line([(sc(x + rx * w), sc(y + 22)), (sc(x + rx * w), sc(y + h - 22))], fill=hx(PALETTE["road"]), width=sc(8 if rx == 0.68 else 6))
    for ry in [0.20, 0.45, 0.69, 0.86]:
        draw.line([(sc(x + 22), sc(y + ry * h)), (sc(x + w - 22), sc(y + ry * h))], fill=hx(PALETTE["road"]), width=sc(8 if ry in [0.45, 0.69] else 5))
    def p(px, py):
        return (x + px * w, y + py * h)
    regular = [p(0.68, 0.20), p(0.68, 0.45), p(0.68, 0.69), p(0.68, 0.86)]
    draw.line([(sc(a), sc(b)) for a, b in regular], fill=hx(PALETTE["route"]), width=sc(7), joint="curve")
    if mode in ["detour", "return"]:
        det = [p(0.68, 0.45), p(0.50, 0.45), p(0.50, 0.69), p(0.68, 0.69)]
        draw.line([(sc(a), sc(b)) for a, b in det], fill=hx(PALETTE["detour_outline"]), width=sc(13), joint="curve")
        draw.line([(sc(a), sc(b)) for a, b in det], fill=hx(PALETTE["route"]), width=sc(7), joint="curve")
        # skipped dashes
        for i in range(5):
            yy = y + (0.48 + i * 0.038) * h
            draw.rounded_rectangle(box(x + 0.655 * w, yy, 20, 8), radius=sc(4), fill=hx(PALETTE["closed"]))
    if mode == "event":
        draw.rounded_rectangle(box(x + 0.54 * w, y + 0.31 * h, 150, 48), radius=sc(18), fill=hx(PALETTE["warning_soft"]), outline=hx(PALETTE["warning"]), width=sc(2))
        draw_text(draw, (x + 0.56 * w, y + 0.34 * h), "Market closure", PALETTE["navy"], F["tiny"])
    bx, by = {"regular": p(0.68, 0.33), "event": p(0.68, 0.44), "detour": p(0.50, 0.58), "return": p(0.68, 0.76)}.get(mode, p(0.68, 0.33))
    draw.ellipse((sc(bx - 18), sc(by - 18), sc(bx + 18), sc(by + 18)), fill=hx(PALETTE["success"]), outline=hx(PALETTE["white"]), width=sc(4))
    draw_text(draw, (bx, by), "11", PALETTE["white"], F["tiny"], anchor="mm")


def draw_phone(img, mode):
    d = ImageDraw.Draw(img)
    x, y, w, h = 1266, 124, 520, 842
    shadow_card(img, (x, y, x + w, y + h), radius=64, fill="#071225", shadow=(7, 18, 44, 70), blur=32, offset=(0, 20))
    d.rounded_rectangle(box(x + 18, y + 18, w - 36, h - 36), radius=sc(46), fill=hx(PALETTE["white"]))
    d.rounded_rectangle(box(x + 188, y + 30, 144, 31), radius=sc(16), fill=hx("#071225"))

    # App header.
    d.rounded_rectangle(box(x + 18, y + 18, w - 36, 138), radius=sc(46), fill=hx(PALETTE["secondary"]))
    d.rectangle(box(x + 18, y + 88, w - 36, 80), fill=hx(PALETTE["secondary"]))
    draw_text(d, (x + 52, y + 62), "9:41", PALETTE["white"], F["phone_small"])
    for dot in range(3):
        cx = x + w - 102 + dot * 18
        d.ellipse(box(cx, y + 56, 6, 6), fill=hx(PALETTE["white"], 230))
    draw_text(d, (x + 52, y + 116), "MyBarrie Transit", PALETTE["white"], F["phone_title"])

    content_x, content_y = x + 45, y + 186
    phone_screen_map(d, content_x, content_y, w - 90, 270, mode)

    if mode == "regular":
        d.rounded_rectangle(box(content_x + 18, content_y + 18, 226, 40), radius=sc(20), fill=hx(PALETTE["white"], 242), outline=hx("#DCE8F3"), width=sc(1))
        draw_text(d, (content_x + 35, content_y + 29), "Route 11", PALETTE["primary_dark"], F["phone_small"])
        card_y = content_y + 310
        d.rounded_rectangle(box(content_x, card_y, w - 90, 178), radius=sc(28), fill=hx(PALETTE["success_soft"]), outline=hx(PALETTE["success"], 210), width=sc(2))
        draw_text(d, (content_x + 25, card_y + 27), "Route 11 is running normally", PALETTE["ink"], F["phone_h1"])
        wrapped(d, (content_x + 25, card_y + 80), "Buses are following regular routing through downtown Barrie.", PALETTE["muted"], F["phone_body"], 360, 5)
    elif mode == "event":
        card_y = content_y + 300
        d.rounded_rectangle(box(content_x, card_y, w - 90, 205), radius=sc(28), fill=hx(PALETTE["warning_soft"]), outline=hx(PALETTE["warning"], 230), width=sc(2))
        draw_text(d, (content_x + 25, card_y + 26), "Farmers Market closure", PALETTE["ink"], F["phone_h1"])
        wrapped(d, (content_x + 25, card_y + 78), "Mulcaster Street closes downtown. Live Detour Detection is watching Route 11 movement.", PALETTE["muted"], F["phone_body"], 360, 5)
        d.rounded_rectangle(box(content_x + 25, card_y + 153, 162, 34), radius=sc(17), fill=hx(PALETTE["warning"]))
        draw_text(d, (content_x + 106, card_y + 170), "Event started", PALETTE["navy"], F["phone_small"], anchor="mm")
    elif mode in ["detour", "return"]:
        # Alert strip.
        strip_y = content_y + 18
        d.rounded_rectangle(box(content_x + 16, strip_y, w - 122, 42), radius=sc(21), fill=hx(PALETTE["warning_soft"], 248), outline=hx(PALETTE["warning"], 210), width=sc(2))
        icon_cx, icon_cy = content_x + 42, strip_y + 21
        d.ellipse(box(icon_cx - 9, icon_cy - 9, 18, 18), fill=hx(PALETTE["warning"]))
        draw_text(d, (icon_cx, icon_cy - 1), "!", PALETTE["navy"], F["tiny"], anchor="mm")
        draw_text(d, (content_x + 76, strip_y + 12), "Detour active", PALETTE["ink"], F["phone_small"])
        route_badge(d, (content_x + w - 185, strip_y + 6), "11", PALETTE["primary"])
        card_y = content_y + 306
        fill = PALETTE["error_soft"] if mode == "detour" else PALETTE["success_soft"]
        outline = PALETTE["closed"] if mode == "detour" else PALETTE["success"]
        d.rounded_rectangle(box(content_x, card_y, w - 90, 246), radius=sc(28), fill=hx(fill), outline=hx(outline, 230), width=sc(2))
        draw_text(d, (content_x + 25, card_y + 25), "Live Detour Detection", PALETTE["muted"], F["phone_small"])
        headline = "Route 11 is currently on detour" if mode == "detour" else "Route 11 rejoins regular routing"
        wrapped(d, (content_x + 25, card_y + 56), headline, PALETTE["ink"], F["phone_h1"], 360, 3)
        body = "Closed segment and likely path are highlighted so riders can adjust before waiting." if mode == "detour" else "The return point is visible, so riders can see where normal service resumes."
        wrapped(d, (content_x + 25, card_y + 144), body, PALETTE["muted"], F["phone_body"], 360, 5)
    d.rounded_rectangle(box(x + 194, y + h - 39, 132, 6), radius=sc(4), fill=hx("#071225", 160))


def draw_stage_chrome(img, stage: Stage):
    d = ImageDraw.Draw(img)
    draw_text(d, (104, 72), f"Mock-up {stage.index}", PALETTE["primary_dark"], F["eyebrow"])
    draw_text(d, (104, 104), stage.title, PALETTE["navy"], F["hero"] if len(stage.title) < 33 else F["hero_small"])
    wrapped(d, (108, 184), stage.subtitle, PALETTE["muted"], F["subtitle"], 1010, 4)

    # Feature chip.
    chip_x, chip_y = 108, 965
    d.rounded_rectangle(box(chip_x, chip_y, 284, 48), radius=sc(24), fill=hx(PALETTE["secondary"]))
    d.ellipse(box(chip_x + 18, chip_y + 17, 14, 14), fill=hx(PALETTE["primary_light"]))
    draw_text(d, (chip_x + 47, chip_y + 13), "Live Detour Detection", PALETTE["white"], F["small"])
    if stage.index >= 3:
        lx = chip_x + 318
        d.rounded_rectangle(box(lx, chip_y, 264, 48), radius=sc(24), fill=hx(PALETTE["white"], 236), outline=hx("#DCE8F3"), width=sc(1))
        d.rounded_rectangle(box(lx + 21, chip_y + 21, 56, 7), radius=sc(4), fill=hx(PALETTE["detour_outline"]))
        d.rounded_rectangle(box(lx + 25, chip_y + 23, 48, 3), radius=sc(2), fill=hx(PALETTE["route"]))
        draw_text(d, (lx + 94, chip_y + 13), "Likely detour path", PALETTE["muted"], F["small"])


def render_stage(stage: Stage):
    img = gradient_background(light=True)
    draw_stage_chrome(img, stage)
    draw_map(img, stage)
    draw_phone(img, stage.mode)
    path = OUT / stage.filename
    final = img.resize((1920, 1080), Image.Resampling.LANCZOS).convert("RGB")
    final.save(path, quality=96)
    print(path)


def render_summary():
    img = gradient_background(light=False)
    d = ImageDraw.Draw(img)

    # Decorative route traces.
    route_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(route_layer)
    rd.line([box(1190, 175, 0, 0)[:2], box(1440, 175, 0, 0)[:2], box(1440, 405, 0, 0)[:2], box(1660, 405, 0, 0)[:2]], fill=hx(PALETTE["primary_light"], 52), width=sc(20), joint="curve")
    rd.line([box(1230, 715, 0, 0)[:2], box(1480, 715, 0, 0)[:2], box(1480, 890, 0, 0)[:2]], fill=hx(PALETTE["warning"], 46), width=sc(18), joint="curve")
    route_layer = route_layer.filter(ImageFilter.GaussianBlur(sc(1)))
    img.alpha_composite(route_layer)

    shadow_card(img, (120, 96, 1800, 888), radius=54, fill="#081A3D", shadow=(0, 0, 0, 85), blur=34, offset=(0, 20), outline="#123460", outline_alpha=180)
    d.rounded_rectangle(box(190, 168, 292, 44), radius=sc(22), fill=hx(PALETTE["primary"], 240))
    draw_text(d, (214, 180), "Live Detour Detection", PALETTE["white"], F["small"])
    draw_text(d, (190, 246), "Know before you wait", PALETTE["white"], F["summary"])
    draw_text(d, (190, 326), "at the wrong stop.", PALETTE["warning"], F["summary"])
    wrapped(d, (194, 430), "When Route 11 leaves regular routing for a downtown event, MyBarrie Transit turns live bus movement into a clear rider alert.", "#CFE2FF", F["summary_copy"], 930, 9)

    items = [
        ("01", "Event begins", "Farmers Market closure starts downtown."),
        ("02", "Bus movement changes", "Route 11 uses the detour path."),
        ("03", "Riders see the path", "Closed segment and likely route are highlighted."),
        ("04", "Service reconnects", "The return to regular routing is clear."),
    ]
    y = 570
    for num, head, body in items:
        d.rounded_rectangle(box(198, y, 72, 50), radius=sc(25), fill=hx(PALETTE["warning"] if num == "01" else PALETTE["primary"]))
        draw_text(d, (234, y + 15), num, PALETTE["navy"] if num == "01" else PALETTE["white"], F["small"], anchor="mm")
        draw_text(d, (294, y - 2), head, PALETTE["white"], F["summary_item"])
        draw_text(d, (294, y + 34), body, "#CFE2FF", F["copy_regular"])
        y += 82

    # Right-side premium phone/map emblem.
    shadow_card(img, (1248, 238, 1660, 656), radius=42, fill="#F7FBFF", shadow=(0, 0, 0, 90), blur=28, offset=(0, 18))
    # mini map in summary card
    sx, sy, sw, sh = 1285, 285, 338, 272
    d.rounded_rectangle(box(sx, sy, sw, sh), radius=sc(26), fill=hx("#EFF7FF"))
    for rx in [0.32, 0.56, 0.76]:
        d.line([(sc(sx + rx * sw), sc(sy + 24)), (sc(sx + rx * sw), sc(sy + sh - 24))], fill=hx(PALETTE["road"]), width=sc(7))
    for ry in [0.22, 0.50, 0.76]:
        d.line([(sc(sx + 24), sc(sy + ry * sh)), (sc(sx + sw - 24), sc(sy + ry * sh))], fill=hx(PALETTE["road"]), width=sc(7))
    d.line([(sc(sx + 0.76 * sw), sc(sy + 0.22 * sh)), (sc(sx + 0.76 * sw), sc(sy + 0.76 * sh))], fill=hx(PALETTE["route"]), width=sc(8))
    d.line([(sc(sx + 0.76 * sw), sc(sy + 0.50 * sh)), (sc(sx + 0.56 * sw), sc(sy + 0.50 * sh)), (sc(sx + 0.56 * sw), sc(sy + 0.76 * sh)), (sc(sx + 0.76 * sw), sc(sy + 0.76 * sh))], fill=hx(PALETTE["detour_outline"]), width=sc(16), joint="curve")
    d.line([(sc(sx + 0.76 * sw), sc(sy + 0.50 * sh)), (sc(sx + 0.56 * sw), sc(sy + 0.50 * sh)), (sc(sx + 0.56 * sw), sc(sy + 0.76 * sh)), (sc(sx + 0.76 * sw), sc(sy + 0.76 * sh))], fill=hx(PALETTE["route"]), width=sc(8), joint="curve")
    d.rounded_rectangle(box(1298, 586, 260, 46), radius=sc(23), fill=hx(PALETTE["warning_soft"]), outline=hx(PALETTE["warning"]), width=sc(2))
    draw_text(d, (1320, 600), "Route 11 detour detected", PALETTE["ink"], F["small"])

    d.rounded_rectangle(box(190, 883, 420, 58), radius=sc(29), fill=hx(PALETTE["warning"]))
    draw_text(d, (400, 902), "Open the app. See the detour.", PALETTE["navy"], F["copy"], anchor="mm")

    path = OUT / "mockup-5-auto-detour-summary.png"
    final = img.resize((1920, 1080), Image.Resampling.LANCZOS).convert("RGB")
    final.save(path, quality=96)
    print(path)


def main():
    stages = [
        Stage(1, "Bus on regular routing", "Route 11 follows the normal Mulcaster Street routing through downtown Barrie.", "mockup-1-bus-on-regular-routing.png", "regular", (0.66, 0.30)),
        Stage(2, "Farmers Market event starts", "The downtown market begins and the Mulcaster Street closure becomes active.", "mockup-2-farmers-market-event-triggers.png", "event", (0.66, 0.38), show_event=True),
        Stage(3, "Bus takes the detour path", "The app turns live bus movement into a clear detour alert for riders.", "mockup-3-bus-takes-the-detour-path.png", "detour", (0.48, 0.54), show_detour=True, show_skip=True),
        Stage(4, "Bus returns to regular routing", "Route 11 rejoins Mulcaster Street and riders can see where regular service resumes.", "mockup-4-bus-returns-to-regular-routing.png", "return", (0.66, 0.73), show_detour=True, show_skip=True, return_marker=True),
    ]
    for stage in stages:
        render_stage(stage)
    render_summary()


if __name__ == "__main__":
    main()

