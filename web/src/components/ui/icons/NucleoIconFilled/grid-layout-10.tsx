import React from 'react';

import { iconProps } from './iconProps';

function gridLayout10(props: iconProps) {
  const strokewidth = props.strokewidth || 1.3;
  const title = props.title || '18px grid layout 10';

  return (
    <svg height="1em" width="1em" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <g fill="currentColor">
        <rect height="15" width="4" fill="currentColor" rx="1.75" ry="1.75" x="12.5" y="1.5" />
        <rect height="4" width="9.5" fill="currentColor" rx="1.75" ry="1.75" x="1.5" y="7" />
        <rect height="4" width="9.5" fill="currentColor" rx="1.75" ry="1.75" x="1.5" y="12.5" />
        <rect height="4" width="9.5" fill="currentColor" rx="1.75" ry="1.75" x="1.5" y="1.5" />
      </g>
    </svg>
  );
}

export default gridLayout10;
