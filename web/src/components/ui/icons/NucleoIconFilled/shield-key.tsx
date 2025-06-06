import React from 'react';

import { iconProps } from './iconProps';

function shieldKey(props: iconProps) {
  const strokewidth = props.strokewidth || 1.3;
  const title = props.title || '18px shield key';

  return (
    <svg height="1em" width="1em" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <g fill="currentColor">
        <path
          d="M13.069,11.804c-.741,.899-1.853,1.446-3.069,1.446-2.206,0-4-1.794-4-4s1.794-4,4-4c1.348,0,2.567,.672,3.296,1.75h2.704v-2.52c0-.764-.489-1.434-1.217-1.667l-5.25-1.68c-.349-.111-.718-.111-1.066,0L3.216,2.813c-.728,.233-1.216,.903-1.216,1.667v6.52c0,3.508,4.946,5.379,6.46,5.869,.177,.057,.358,.086,.54,.086s.362-.028,.538-.085c1.107-.358,4.034-1.455,5.538-3.384-.971-.076-1.774-.763-2.007-1.681Z"
          fill="currentColor"
        />
        <path
          d="M16.5,8.5h-4.128c-.321-1.011-1.257-1.75-2.372-1.75-1.378,0-2.5,1.122-2.5,2.5s1.122,2.5,2.5,2.5c1.115,0,2.051-.739,2.372-1.75h2.128v1.25c0,.414,.336,.75,.75,.75s.75-.336,.75-.75v-1.25h.5c.414,0,.75-.336,.75-.75s-.336-.75-.75-.75Zm-6.5,1.75c-.551,0-1-.449-1-1s.449-1,1-1,1,.449,1,1-.449,1-1,1Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export default shieldKey;
