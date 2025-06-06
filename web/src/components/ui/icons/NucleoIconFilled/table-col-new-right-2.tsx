import React from 'react';

import { iconProps } from './iconProps';

function tableColNewRight2(props: iconProps) {
  const strokewidth = props.strokewidth || 1.3;
  const title = props.title || '12px table col new right 2';

  return (
    <svg height="1em" width="1em" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <g fill="currentColor">
        <rect height="1em" width="5.5" fill="currentColor" rx="2.25" ry="2.25" strokeWidth="0" />
        <path
          d="m11.25,5.25h-1.25v-1.25c0-.414-.336-.75-.75-.75s-.75.336-.75.75v1.25h-1.25c-.414,0-.75.336-.75.75s.336.75.75.75h1.25v1.25c0,.414.336.75.75.75s.75-.336.75-.75v-1.25h1.25c.414,0,.75-.336.75-.75s-.336-.75-.75-.75Z"
          fill="currentColor"
          strokeWidth="0"
        />
      </g>
    </svg>
  );
}

export default tableColNewRight2;
