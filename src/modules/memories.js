export function createMemoryUI({stories,layer,archive,state,onClose}) {
  const byId=new Map(stories.map(story=>[story.id,story]));
  let current=null,continueAction=null;
  const image=layer.querySelector('img'),title=layer.querySelector('h2'),text=layer.querySelector('.memory-text');
  const number=layer.querySelector('.memory-number'),close=layer.querySelector('button');
  function show(id,continuation=null) {
    const story=byId.get(id);
    if(!story||!state.unlockedStories.includes(id))return;
    current=id;continueAction=continuation;
    title.textContent=story.title;text.textContent=story.text;
    number.textContent=`碎片记忆 ${String(stories.indexOf(story)+1).padStart(2,'0')} / ${stories.length}`;
    image.src=import.meta.env.BASE_URL+story.image;
    image.alt=`${story.title}：自制青花纹样习作`;
    close.textContent=continuation?'继续演示 →':state.repairedCount===state.totalCount?'进入修复抉择 →':'继续修复 →';
    layer.classList.remove('hidden');
    close.focus({preventScroll:true});
  }
  function hide(notify=true) {
    layer.classList.add('hidden');current=null;
    const action=continueAction;continueAction=null;
    if(notify) {if(action)action();else onClose();}
  }
  function refresh() {
    archive.replaceChildren();
    for(const story of stories) {
      const button=document.createElement('button');
      button.type='button';button.textContent=state.unlockedStories.includes(story.id)?story.title:'尚未解锁';
      button.disabled=!state.unlockedStories.includes(story.id);
      button.dataset.storyId=story.id;button.onclick=()=>show(story.id);
      archive.append(button);
    }
  }
  close.onclick=()=>hide();
  layer.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  image.onerror=()=>{image.hidden=true;};image.onload=()=>{image.hidden=false;};
  return {show,hide,refresh,isOpen:()=>current!==null};
}
