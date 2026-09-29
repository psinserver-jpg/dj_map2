#!/usr/bin/env python
"""상가(상권)정보 CSV -> 웹용 JSON 변환

사용법:  python tools/build_data.py
입력 :  ../data/소상공인시장진흥공단_상가(상권)정보_부산_*.csv  (UTF-8 BOM)
        ../data/소상공인시장진흥공단_상가(상권)정보 업종코드_*.csv (CP949)
출력 :  data/meta.js, data/points.js, data/detail/<시군구코드>.js
        (file:// 로 열어도 <script>로 읽히도록 JS 형식으로 저장)
"""
import csv
import glob
import json
import os
import statistics
import sys
from collections import Counter, OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(ROOT), "data")
OUT = os.path.join(ROOT, "data")

# iOS system colors, 대분류 코드별
CAT_STYLE = {
    "I2": ("#FF9500", "fork"),    # 음식
    "G2": ("#007AFF", "bag"),     # 소매
    "S2": ("#AF52DE", "wrench"),  # 수리·개인
    "M1": ("#5856D6", "flask"),   # 과학·기술
    "P1": ("#34C759", "book"),    # 교육
    "N1": ("#8E8E93", "building"),  # 시설관리·임대
    "R1": ("#FF2D55", "ticket"),  # 예술·스포츠
    "L1": ("#A2845E", "house"),   # 부동산
    "I1": ("#00C7BE", "bed"),     # 숙박
    "Q1": ("#FF3B30", "cross"),   # 보건의료
}


def log(*a):
    print(*a, flush=True)


def find(pattern):
    hits = sorted(glob.glob(os.path.join(SRC, pattern)))
    hits = [h for h in hits if "편의점" not in h]
    if not hits:
        sys.exit("입력 파일을 찾을 수 없습니다: " + pattern)
    return hits[-1]


def to_int(s):
    s = (s or "").strip()
    return int(s) if s.isdigit() else 0


def main():
    shop_csv = find("*상가(상권)정보_부산_*.csv")
    code_csv = find("*업종코드*.csv")
    log("상가 CSV :", os.path.basename(shop_csv))
    log("업종 CSV :", os.path.basename(code_csv))

    # ---------- 업종코드 트리 (CP949) ----------
    code_names = {}  # 코드 -> 이름 (대/중/소)
    with open(code_csv, encoding="cp949", newline="") as fh:
        r = csv.reader(fh)
        next(r)
        for row in r:
            if len(row) < 6:
                continue
            for c, n in ((row[0], row[1]), (row[2], row[3]), (row[4], row[5])):
                code_names[c.strip()] = n.strip()

    # ---------- 상가 CSV (UTF-8 BOM) ----------
    with open(shop_csv, encoding="utf-8-sig", newline="") as fh:
        r = csv.reader(fh)
        header = next(r)
        rows = list(r)
    ix = {k: i for i, k in enumerate(header)}
    log("행 수    :", len(rows))

    # 업종 트리 (데이터 기준, 이름은 데이터 우선)
    cat_map = OrderedDict()   # code -> name
    mid_map = OrderedDict()   # code -> (name, cat)
    sub_map = OrderedDict()   # code -> (name, mid)
    for x in rows:
        c1, c2, c3 = x[ix["상권업종대분류코드"]], x[ix["상권업종중분류코드"]], x[ix["상권업종소분류코드"]]
        cat_map.setdefault(c1, x[ix["상권업종대분류명"]].strip())
        mid_map.setdefault(c2, (x[ix["상권업종중분류명"]].strip(), c1))
        sub_map.setdefault(c3, (x[ix["상권업종소분류명"]].strip(), c2))
    unmapped = [c for c in list(cat_map) + list(mid_map) + list(sub_map) if c not in code_names]
    log("업종코드표에 없는 코드(데이터 이름으로 보완):", len(unmapped), unmapped[:10])
    diff = [c for c in code_names if c in sub_map and sub_map[c][0] != code_names[c]]
    if diff:
        log("이름이 다른 소분류(데이터 이름 사용):", len(diff))

    # 시군구
    dist_rows = OrderedDict()
    for x in rows:
        dist_rows.setdefault(x[ix["시군구코드"]], x[ix["시군구명"]])
    dist_codes = sorted(dist_rows)
    dist_idx = {c: i for i, c in enumerate(dist_codes)}

    # 표준산업분류
    ksic_idx, ksic_list = {}, []
    for x in rows:
        k = (x[ix["표준산업분류코드"]], x[ix["표준산업분류명"]].strip())
        if k not in ksic_idx:
            ksic_idx[k] = len(ksic_list)
            ksic_list.append([k[0], k[1]])

    # 건수 집계 -> 정렬
    cat_cnt = Counter(x[ix["상권업종대분류코드"]] for x in rows)
    mid_cnt = Counter(x[ix["상권업종중분류코드"]] for x in rows)
    sub_cnt = Counter(x[ix["상권업종소분류코드"]] for x in rows)
    cat_codes = sorted(cat_map, key=lambda c: -cat_cnt[c])
    mid_codes = sorted(mid_map, key=lambda c: (cat_codes.index(mid_map[c][1]), -mid_cnt[c]))
    sub_codes = sorted(sub_map, key=lambda c: (mid_codes.index(sub_map[c][1]), -sub_cnt[c]))
    ci = {c: i for i, c in enumerate(cat_codes)}
    mi = {c: i for i, c in enumerate(mid_codes)}
    si = {c: i for i, c in enumerate(sub_codes)}

    # ---------- 정렬: 시군구 -> 원본 순서 ----------
    order = sorted(range(len(rows)), key=lambda i: dist_idx[rows[i][ix["시군구코드"]]])

    P = {"lon": [], "lat": [], "sub": [], "dist": [], "name": [], "addr": [], "id": [], "branch": {}, "bname": {}}
    shards = {c: {"h": OrderedDict(), "b": OrderedDict(), "r": OrderedDict(), "rows": []} for c in dist_codes}
    start = {}
    mismatch_jibun = 0
    missing_coord = 0
    lon_list, lat_list = [], []
    per_dist_coords = {c: ([], []) for c in dist_codes}

    def dict_idx(d, key):
        if key not in d:
            d[key] = len(d)
        return d[key]

    for n, i in enumerate(order):
        x = rows[i]
        dc = x[ix["시군구코드"]]
        dname = x[ix["시군구명"]]
        if dc not in start:
            start[dc] = n
        try:
            lon = round(float(x[ix["경도"]]), 6)
            lat = round(float(x[ix["위도"]]), 6)
        except ValueError:
            missing_coord += 1
            lon = lat = 0
        addr = x[ix["도로명주소"]].strip()
        if addr.startswith("부산광역시 "):
            addr = addr[len("부산광역시 "):]
        P["lon"].append(lon)
        P["lat"].append(lat)
        P["sub"].append(si[x[ix["상권업종소분류코드"]]])
        P["dist"].append(dist_idx[dc])
        P["name"].append(x[ix["상호명"]].strip())
        P["addr"].append(addr)
        P["id"].append(x[ix["상가업소번호"]])
        if x[ix["지점명"]].strip():
            P["branch"][n] = x[ix["지점명"]].strip()
        if x[ix["건물명"]].strip():
            P["bname"][n] = x[ix["건물명"]].strip()
        per_dist_coords[dc][0].append(lon)
        per_dist_coords[dc][1].append(lat)
        lon_list.append(lon)
        lat_list.append(lat)

        sh = shards[dc]
        hd = dict_idx(sh["h"], (x[ix["행정동코드"]], x[ix["행정동명"]].strip()))
        bd = dict_idx(sh["b"], (x[ix["법정동코드"]], x[ix["법정동명"]].strip()))
        road_name = x[ix["도로명"]].strip()
        pre = "부산광역시 " + dname + " "
        if road_name.startswith(pre):
            road_name = road_name[len(pre):]
        rd = dict_idx(sh["r"], (x[ix["도로명코드"]], road_name))
        land = x[ix["대지구분코드"]] or "1"
        bon, bu = to_int(x[ix["지번본번지"]]), to_int(x[ix["지번부번지"]])
        # 지번코드는 다른 필드로 복원 가능 -> 저장하지 않고 검증만
        rebuilt = "%s%s%04d%04d" % (x[ix["법정동코드"]], land, bon, bu)
        if rebuilt != x[ix["지번코드"]]:
            mismatch_jibun += 1
        sh["rows"].append([
            hd, bd, land, bon, bu, rd,
            x[ix["건물관리번호"]],
            x[ix["건물명"]].strip(),
            x[ix["신우편번호"]],
            x[ix["구우편번호"]],
            x[ix["층정보"]].strip(),
            x[ix["동정보"]].strip(),
            x[ix["호정보"]].strip(),
            ksic_idx[(x[ix["표준산업분류코드"]], x[ix["표준산업분류명"]].strip())],
        ])

    # ---------- meta.json ----------
    def cat_color(c):
        return CAT_STYLE.get(c, ("#8E8E93", "building"))

    meta = {
        "source": "소상공인시장진흥공단 상가(상권)정보 " + os.path.basename(shop_csv).split("_")[-1].split(".")[0],
        "total": len(rows),
        "bounds": [min(lon_list), min(lat_list), max(lon_list), max(lat_list)],
        "cats": [
            {"code": c, "name": cat_map[c], "color": cat_color(c)[0], "icon": cat_color(c)[1], "count": cat_cnt[c]}
            for c in cat_codes
        ],
        "mids": [
            {"code": c, "name": mid_map[c][0], "cat": ci[mid_map[c][1]], "count": mid_cnt[c]} for c in mid_codes
        ],
        "subs": [
            {"code": c, "name": sub_map[c][0], "mid": mi[sub_map[c][1]], "count": sub_cnt[c]} for c in sub_codes
        ],
        "dists": [
            {
                "code": c,
                "name": dist_rows[c],
                "count": len(per_dist_coords[c][0]),
                "start": start[c],
                "center": [statistics.median(per_dist_coords[c][0]), statistics.median(per_dist_coords[c][1])],
            }
            for c in dist_codes
        ],
        "ksic": ksic_list,
        "rowFields": ["hdong", "bdong", "land", "bon", "bu", "road", "bldgNo", "bldgName", "zipNew", "zipOld",
                      "floor", "dongInfo", "hoInfo", "ksic"],
    }

    os.makedirs(os.path.join(OUT, "detail"), exist_ok=True)

    def dump(path, obj, prefix):
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(prefix)
            json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
            fh.write(";\n")
        return os.path.getsize(path)

    sizes = {}
    sizes["meta.js"] = dump(os.path.join(OUT, "meta.js"), meta, "window.BUSAN_META=")
    P["n"] = len(rows)
    sizes["points.js"] = dump(os.path.join(OUT, "points.js"), P, "window.BUSAN_POINTS=")
    total_detail = 0
    for c, sh in shards.items():
        obj = {
            "h": [list(k) for k in sh["h"]],
            "b": [list(k) for k in sh["b"]],
            "r": [list(k) for k in sh["r"]],
            "rows": sh["rows"],
        }
        s = dump(os.path.join(OUT, "detail", c + ".js"), obj, "(window.BUSAN_DETAIL=window.BUSAN_DETAIL||{})[\"%s\"]=" % c)
        total_detail += s
    sizes["detail/*.js (%d개)" % len(shards)] = total_detail

    # ---------- 검증 ----------
    log("\n=== 검증 ===")
    log("총 건수            :", len(rows))
    log("좌표 누락          :", missing_coord)
    log("상가업소번호 중복  :", len(rows) - len(set(P["id"])))
    log("지번코드 복원 불일치:", mismatch_jibun)
    log("대분류/중분류/소분류:", len(cat_codes), len(mid_codes), len(sub_codes))
    log("시군구             :", len(dist_codes))
    log("표준산업분류       :", len(ksic_list))
    for k, v in sizes.items():
        log("%-24s %8.2f MB" % (k, v / 1048576))
    big = max(os.path.getsize(p) for p in glob.glob(os.path.join(OUT, "detail", "*.js")))
    log("가장 큰 상세 샤드   : %.2f MB" % (big / 1048576))


if __name__ == "__main__":
    main()
