#!/bin/bash
# Suppress webpack deprecation warnings in development

# Run npm start with suppressed warnings
NODE_OPTIONS="--no-deprecation" npm start