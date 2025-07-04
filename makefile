.PHONY: build

build:
	@echo "Building the project..."
	npm run build

deploy:
	@echo "Deploying the project to gh-pages..."
	npm run predeploy
	npm run deploy