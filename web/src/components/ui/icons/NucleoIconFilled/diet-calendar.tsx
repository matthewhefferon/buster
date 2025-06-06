import React from 'react';

import { iconProps } from './iconProps';

function dietCalendar(props: iconProps) {
  const strokewidth = props.strokewidth || 1.3;
  const title = props.title || '18px diet calendar';

  return (
    <svg height="1em" width="1em" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <g fill="currentColor">
        <path
          d="M16.375,11.038c-.905-.72-1.879-.529-2.592-.388-.495,.097-.843,.102-1.331-.005-.686-.15-1.624-.354-2.604,.379-1.404,1.05-1.479,3.397-.171,5.46,1.142,1.798,2.496,1.548,3.146,1.428,.209-.038,.352-.038,.559,0,.197,.037,.459,.085,.759,.085,.692,0,1.593-.258,2.389-1.514,1.343-2.121,1.004-4.527-.155-5.446Z"
          fill="currentColor"
        />
        <path
          d="M14.667,8h0c.184,0,.333,.149,.333,.333h0c0,.92-.747,1.667-1.667,1.667h0c-.184,0-.333-.149-.333-.333h0c0-.92,.747-1.667,1.667-1.667Z"
          fill="currentColor"
        />
        <path
          d="M13.25,2h-.75V.75c0-.414-.336-.75-.75-.75s-.75,.336-.75,.75v1.25H6V.75c0-.414-.336-.75-.75-.75s-.75,.336-.75,.75v1.25h-.75c-1.517,0-2.75,1.233-2.75,2.75V13.25c0,1.517,1.233,2.75,2.75,2.75h3.5c.414,0,.75-.336,.75-.75s-.336-.75-.75-.75H3.75c-.689,0-1.25-.561-1.25-1.25V7H15.25c.414,0,.75-.336,.75-.75v-1.5c0-1.517-1.233-2.75-2.75-2.75Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export default dietCalendar;
