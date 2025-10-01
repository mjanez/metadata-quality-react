/// <reference types="react-scripts" />
/// <reference types="react" />
/// <reference types="react-dom" />

// Fix for React 19 JSX runtime issues
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

// Fix for react/jsx-runtime module resolution
declare module 'react/jsx-runtime' {
  export * from 'react/jsx-runtime';
}