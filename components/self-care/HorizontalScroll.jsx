'use client'

import React, { useRef } from 'react';

export default function HorizontalScroll({ children, className = '' }) {
  const scrollRef = useRef(null);

  return (
    <div 
      ref={scrollRef}
      className={`flex overflow-x-auto gap-4 py-4 -mt-4 snap-x snap-mandatory self-care-scroll ${className}`}
      style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
    >
      {children}
    </div>
  );
}
