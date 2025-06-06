import React from 'react';

import { iconProps } from './iconProps';

function download4(props: iconProps) {
  const strokewidth = props.strokewidth || 1.3;
  const title = props.title || '18px download 4';

  return (
    <svg height="1em" width="1em" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <g fill="currentColor">
        <path
          d="M15.25,11c-.414,0-.75,.336-.75,.75v1.5c0,.689-.561,1.25-1.25,1.25H4.75c-.689,0-1.25-.561-1.25-1.25v-1.5c0-.414-.336-.75-.75-.75s-.75,.336-.75,.75v1.5c0,1.517,1.233,2.75,2.75,2.75H13.25c1.517,0,2.75-1.233,2.75-2.75v-1.5c0-.414-.336-.75-.75-.75Z"
          fill="currentColor"
        />
        <path
          d="M8.47,10.78c.146,.146,.338,.22,.53,.22s.384-.073,.53-.22l3.5-3.5c.293-.293,.293-.768,0-1.061s-.768-.293-1.061,0l-2.22,2.22V2.75c0-.414-.336-.75-.75-.75s-.75,.336-.75,.75v5.689l-2.22-2.22c-.293-.293-.768-.293-1.061,0s-.293,.768,0,1.061l3.5,3.5Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export default download4;
