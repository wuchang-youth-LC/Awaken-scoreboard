"""從海報截圖裁出網頁用素材：白色線稿去背、標題字縮圖。"""
import sys
from collections import deque
from PIL import Image

poster_path, out_dir = sys.argv[1], sys.argv[2]
S = 1.181  # 顯示座標 -> 原圖座標
src = Image.open(poster_path).convert("RGB")


def crop(box):
    a, b, c, d = box
    return src.crop((int(a * S), int(b * S), int(c * S), int(d * S)))


def white_alpha(px):
    """越接近白色越不透明（保留抗鋸齒邊緣）"""
    r, g, b = px
    lo, hi = min(px), max(px)
    if hi - lo > 60:  # 有顏色的不算白
        return 0
    return max(0, min(255, int((lo - 150) / (230 - 150) * 255)))


def cutout(img, keep_holes_over=0, hole_color=None):
    w, h = img.size
    px = img.load()
    alpha = [[white_alpha(px[x, y]) for x in range(w)] for y in range(h)]
    out = Image.new("RGBA", (w, h))
    o = out.load()
    for y in range(h):
        for x in range(w):
            o[x, y] = (255, 255, 255, alpha[y][x])

    if keep_holes_over:
        # 從邊界往內填：碰得到邊界的非白色區域是背景；被白色包住的大區塊（愛心）保留下來
        outside = [[False] * w for _ in range(h)]
        q = deque((x, y) for x in range(w) for y in (0, h - 1))
        q.extend((x, y) for y in range(h) for x in (0, w - 1))
        while q:
            x, y = q.popleft()
            if not (0 <= x < w and 0 <= y < h) or outside[y][x] or alpha[y][x] > 128:
                continue
            outside[y][x] = True
            q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
        seen = [[False] * w for _ in range(h)]
        for sy in range(h):
            for sx in range(w):
                if seen[sy][sx] or outside[sy][sx] or alpha[sy][sx] > 128:
                    continue
                region, q = [], deque([(sx, sy)])
                while q:
                    x, y = q.popleft()
                    if not (0 <= x < w and 0 <= y < h) or seen[y][x] or outside[y][x] or alpha[y][x] > 128:
                        continue
                    seen[y][x] = True
                    region.append((x, y))
                    q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
                if len(region) >= keep_holes_over:
                    for x, y in region:
                        o[x, y] = (*hole_color, 255)
    return out


cutout(crop((45, 65, 240, 185))).save(f"{out_dir}/logo-awaken.png", optimize=True)
cutout(crop((40, 225, 240, 425)), keep_holes_over=400, hole_color=(240, 122, 42)).save(f"{out_dir}/badge.png", optimize=True)

word = crop((395, 240, 1615, 885))
word = word.resize((1200, int(1200 * word.height / word.width)), Image.LANCZOS)
word.save(f"{out_dir}/wordmark.jpg", quality=82, optimize=True, progressive=True)
print("done")
