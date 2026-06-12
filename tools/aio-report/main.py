#!/usr/bin/env python3
"""
メディくる AIO-report — SEO競合調査ツール

Usage:
  python main.py --seo-report           # SEO競合調査レポート生成
  python main.py --seo-report --dry-run # ファイル保存せず標準出力のみ
"""

import sys, logging, argparse
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent))
from modules.seo_competitor import SEOCompetitorEngine


def setup_logging(log_file: str = "data/aio_report.log"):
    Path(log_file).parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(log_file, encoding="utf-8"),
        ]
    )


def load_config(config_path: str = "config.yml") -> dict:
    with open(config_path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def main():
    parser = argparse.ArgumentParser(description="メディくる AIO-report")
    parser.add_argument("--seo-report", action="store_true", help="SEO競合調査レポートを生成")
    parser.add_argument("--dry-run", action="store_true", help="ファイル保存なし（確認用）")
    parser.add_argument("--config", default="config.yml", help="設定ファイルパス")
    args = parser.parse_args()

    config = load_config(args.config)
    setup_logging(config.get("scheduler", {}).get("log_file", "data/aio_report.log"))

    if args.seo_report:
        engine = SEOCompetitorEngine(config)
        engine.run(dry_run=args.dry_run)
    else:
        print("使い方: python main.py --seo-report [--dry-run]")
        parser.print_help()


if __name__ == "__main__":
    main()
