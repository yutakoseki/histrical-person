SHELL := /bin/bash

.PHONY: install bootstrap deploy destroy synth test lint format clean

install:
	pnpm install --recursive

bootstrap:
	pnpm cdk:bootstrap

deploy:
	pnpm cdk:deploy

destroy:
	pnpm cdk:destroy

synth:
	pnpm cdk synth

test:
	pnpm test

lint:
	pnpm lint:py

format:
	pnpm format:py

clean:
	find lambdas -name "__pycache__" -type d -prune -exec rm -rf {} +
