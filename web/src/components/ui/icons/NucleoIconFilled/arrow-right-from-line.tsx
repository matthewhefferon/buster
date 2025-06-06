import React from 'react';

import { iconProps } from './iconProps';

function arrowRightFromLine(props: iconProps) {
  const strokewidth = props.strokewidth || 1.3;
  const title = props.title || '12px arrow right from line';

  return (
    <svg height="1em" width="1em" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <g fill="currentColor">
        <path
          d="m1.25,11.5c-.414,0-.75-.336-.75-.75V1.25c0-.414.336-.75.75-.75s.75.336.75.75v9.5c0,.414-.336.75-.75.75Z"
          fill="currentColor"
          strokeWidth="0"
        />
        <path
          d="m8.28,2.47c-.293-.293-.768-.293-1.061,0s-.293.768,0,1.061l1.72,1.72h-4.689c-.414,0-.75.336-.75.75s.336.75.75.75h4.689l-1.72,1.72c-.293.293-.293.768,0,1.061.146.146.338.22.53.22s.384-.073.53-.22l3-3c.293-.293.293-.768,0-1.061l-3-3Z"
          fill="currentColor"
          strokeWidth="0"
        />
      </g>
    </svg>
  );
}

export default arrowRightFromLine;
