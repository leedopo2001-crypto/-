"""
이미지 속 글자를 텍스트로 추출 (OCR) - 한글/영어
- 폴더 안의 모든 이미지를 읽어서 글자를 뽑아 txt로 저장

설치 (한 번만):
    pip install easyocr pillow

사용법:
    python ocr_images.py "글제목_images"          (폴더 통째로)
    python ocr_images.py image1.jpg image2.png     (개별 파일)
"""

import os
import sys

try:
    import easyocr
    import numpy as np
    from PIL import Image
except ImportError:
    print("필요한 패키지 미설치. 먼저 실행:  pip install easyocr pillow")
    sys.exit(1)

IMG_EXT = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp")


def collect_images(paths):
    """파일/폴더 인자를 받아 이미지 파일 목록으로 펼침"""
    files = []
    for p in paths:
        if os.path.isdir(p):
            for name in sorted(os.listdir(p)):
                if name.lower().endswith(IMG_EXT):
                    files.append(os.path.join(p, name))
        elif os.path.isfile(p) and p.lower().endswith(IMG_EXT):
            files.append(p)
        else:
            print(f"  (건너뜀: {p})")
    return files


def main():
    if len(sys.argv) < 2:
        print('사용법: python ocr_images.py "폴더명"  또는  python ocr_images.py 이미지파일들')
        sys.exit(1)

    images = collect_images(sys.argv[1:])
    if not images:
        print("이미지를 못 찾음.")
        sys.exit(1)

    print(f"이미지 {len(images)}개 발견. OCR 엔진 로딩 중... (처음엔 모델 다운로드로 좀 걸림)")
    # 한국어 + 영어. GPU 없으면 자동으로 CPU 사용
    reader = easyocr.Reader(["ko", "en"], gpu=False)

    # 첫 이미지의 폴더 기준으로 결과 파일 이름 정함
    base = sys.argv[1].rstrip("/\\")
    out_name = (os.path.basename(base) or "ocr") + "_OCR.txt"

    all_text = []
    for idx, img in enumerate(images, 1):
        print(f"  [{idx}/{len(images)}] {os.path.basename(img)} 처리 중...")
        try:
            # 한글 경로 대응: OpenCV(imread) 대신 PIL로 열어서 배열로 넘김
            img_arr = np.array(Image.open(img).convert("RGB"))
            # detail=0 -> 글자만, paragraph=True -> 줄을 문단으로 묶음
            lines = reader.readtext(img_arr, detail=0, paragraph=True)
            text = "\n".join(lines).strip()
        except Exception as e:
            text = f"(오류: {e})"
        all_text.append(f"===== {os.path.basename(img)} =====\n{text}\n")

    with open(out_name, "w", encoding="utf-8") as f:
        f.write("\n".join(all_text))

    print(f"\n[완료] {out_name} 에 저장됨")


if __name__ == "__main__":
    main()
