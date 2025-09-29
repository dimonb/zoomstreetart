.PHONY: download build serve

PROFILE = zoomstreetart
HUGO_DIR = site
VENV = .venv

download:
	. $(VENV)/bin/activate && \
	instaloader --login $(USER) $(PROFILE)

build:
	rm -rf $(HUGO_DIR)/content/posts/*
	rm -rf $(HUGO_DIR)/static/media/*
	. $(VENV)/bin/activate && \
	python insta_to_hugo.py --src ./$(PROFILE) --out ./$(HUGO_DIR) --author "Zoom Street Art"
	cd $(HUGO_DIR) && hugo --minify

serve:
	cd $(HUGO_DIR) && hugo server -D