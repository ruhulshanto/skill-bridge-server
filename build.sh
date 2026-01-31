#!/bin/bash

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Build the application
npm run build

echo "✅ Build complete!"
