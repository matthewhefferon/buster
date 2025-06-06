import React from 'react';

import { iconProps } from './iconProps';

function hexadecagonStar(props: iconProps) {
  const strokewidth = props.strokewidth || 1.3;
  const title = props.title || '18px hexadecagon star';

  return (
    <svg height="1em" width="1em" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <g fill="currentColor">
        <path
          d="M12.606,7.655c-.044-.136-.161-.235-.302-.255l-2.051-.298-.917-1.858c-.127-.256-.546-.256-.673,0l-.917,1.858-2.051,.298c-.141,.021-.258,.12-.302,.255-.044,.136-.007,.285,.095,.384l1.484,1.446-.351,2.042c-.024,.141,.034,.283,.149,.367s.269,.094,.395,.029l1.834-.964,1.834,.964c.055,.029,.115,.043,.174,.043,.078,0,.155-.024,.221-.072,.115-.084,.173-.226,.149-.367l-.351-2.042,1.484-1.446c.102-.1,.139-.249,.095-.384Z"
          fill="currentColor"
        />
        <path
          d="M15.718,8.293l-1.468-1.468v-2.075c0-.552-.448-1-1-1h-2.075l-1.468-1.468c-.391-.39-1.024-.39-1.414,0l-1.468,1.468h-2.075c-.552,0-1,.448-1,1v2.075l-1.468,1.468c-.391,.39-.391,1.024,0,1.414l1.468,1.468v2.075c0,.552,.448,1,1,1h2.075l1.468,1.468c.391,.39,1.024,.39,1.414,0l1.468-1.468h2.075c.552,0,1-.448,1-1v-2.075l1.468-1.468c.391-.39,.391-1.024,0-1.414Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokewidth}
        />
      </g>
    </svg>
  );
}

export default hexadecagonStar;
