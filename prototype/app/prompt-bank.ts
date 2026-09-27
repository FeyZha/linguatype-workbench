export const PROMPT_CATEGORIES = ['教育', '科技', '社会', '环境', '工作'] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export type OriginalPrompt = {
  id: string;
  title: string;
  category: PromptCategory;
  taskType: '同意与否' | '讨论双方' | '问题与解决' | '双问题';
  difficulty: '适合起步' | '需要权衡';
  prompt: string;
};

export const ORIGINAL_PROMPTS: OriginalPrompt[] = [
  {
    id: 'original-education-practical-skills-v1',
    title: '学校是否应增加生活技能课程',
    category: '教育',
    taskType: '同意与否',
    difficulty: '适合起步',
    prompt:
      'Some people believe secondary schools should spend more time teaching practical life skills, such as managing money and preparing simple meals, and less time on traditional academic subjects. To what extent do you agree or disagree?',
  },
  {
    id: 'original-education-major-breadth-v1',
    title: '大学生是否应学习专业外课程',
    category: '教育',
    taskType: '讨论双方',
    difficulty: '需要权衡',
    prompt:
      'Some people think university students should focus only on subjects related to their future careers. Others believe they should also study courses outside their main field. Discuss both views and give your own opinion.',
  },
  {
    id: 'original-technology-ai-schools-v1',
    title: '学校应如何对待生成式 AI',
    category: '科技',
    taskType: '同意与否',
    difficulty: '需要权衡',
    prompt:
      'As generative AI tools become widely available, some people argue that schools should prohibit students from using them for homework. To what extent do you agree or disagree?',
  },
  {
    id: 'original-technology-public-services-v1',
    title: '公共服务全面数字化的问题',
    category: '科技',
    taskType: '问题与解决',
    difficulty: '适合起步',
    prompt:
      'More public services are now provided mainly through websites and mobile applications. What problems can this create for some members of society, and what measures could address these problems?',
  },
  {
    id: 'original-society-family-home-v1',
    title: '年轻人与父母共同居住更久',
    category: '社会',
    taskType: '双问题',
    difficulty: '适合起步',
    prompt:
      'In many cities, young adults are living with their parents for longer than previous generations did. Why is this happening? Do you think this is a positive or negative development?',
  },
  {
    id: 'original-society-local-community-v1',
    title: '城市居民缺少邻里联系',
    category: '社会',
    taskType: '问题与解决',
    difficulty: '需要权衡',
    prompt:
      'People living in large cities often have little contact with their neighbours. What are the main causes of this situation, and how can stronger local communities be encouraged?',
  },
  {
    id: 'original-environment-green-space-v1',
    title: '用绿地替代市中心停车空间',
    category: '环境',
    taskType: '同意与否',
    difficulty: '需要权衡',
    prompt:
      'Some people believe city centres should replace a substantial amount of parking space with parks and other green areas. To what extent do you agree or disagree?',
  },
  {
    id: 'original-environment-household-waste-v1',
    title: '家庭垃圾减量由谁负责',
    category: '环境',
    taskType: '讨论双方',
    difficulty: '需要权衡',
    prompt:
      'Some people think individuals are mainly responsible for reducing household waste, while others believe governments and businesses should take the lead. Discuss both views and give your own opinion.',
  },
  {
    id: 'original-work-career-changes-v1',
    title: '一生多次转换职业',
    category: '工作',
    taskType: '双问题',
    difficulty: '适合起步',
    prompt:
      'An increasing number of people expect to change careers several times during their working lives. Why is this becoming more common? Is it a positive or negative development?',
  },
  {
    id: 'original-work-remote-collaboration-v1',
    title: '远程办公与团队合作',
    category: '工作',
    taskType: '讨论双方',
    difficulty: '需要权衡',
    prompt:
      'Some people believe working from home improves employees’ quality of life. Others argue that regularly working together in the same place is better for both workers and organisations. Discuss both views and give your own opinion.',
  },
];
