import { findMixedSentences } from './sentence-tracking.ts';
import { ORIGINAL_PROMPTS } from './prompt-bank.ts';
import {
  createEssayDocument,
  type EssayDocument,
  type ScaffoldResult,
} from './workspace-state.ts';

export const DEMO_LIBRARY_RELEASED_AT = '2026-09-03T09:35:20.000Z';
export const DEMO_LIBRARY_RELEASE_KEY = 'linguatype:demo-library-release';
export const DEMO_LIBRARY_RELEASE = '2026-09-14-recall-ready-v5';
export const DEMO_RECALL_DOCUMENT_ID = 'demo-university-digital-access';

function completeEssay(...paragraphs: string[]) {
  return paragraphs.join('\n\n');
}

function demoDocument(documentId: string, taskPrompt: string, essay: string): EssayDocument {
  return createEssayDocument(documentId, DEMO_LIBRARY_RELEASED_AT, {
    taskPrompt,
    essay,
    promptSource: { kind: 'custom' },
  });
}

function originalPromptDocument(documentId: string, promptId: string, essay: string) {
  const prompt = ORIGINAL_PROMPTS.find((item) => item.id === promptId);
  if (!prompt) throw new Error(`Missing original prompt: ${promptId}`);
  return createEssayDocument(documentId, DEMO_LIBRARY_RELEASED_AT, {
    taskPrompt: prompt.prompt,
    essay,
    promptSource: {
      kind: 'original_bank',
      promptId: prompt.id,
      promptVersion: 1,
      category: prompt.category,
      title: prompt.title,
    },
  });
}

export const DEMO_DOCUMENTS = [
  demoDocument(
    'initial',
    'Some people think schools should allow students to use generative AI for homework, while others believe it should be prohibited. Discuss both views and give your own opinion.',
    completeEssay(
      'Generative AI is already part of many students\' daily lives, so schools must decide how it should be treated in homework. Some people favour a complete ban because they fear that students will submit polished answers they did not create. Others argue that these tools can support learning when they are 在明确规则下使用. This debate matters because homework serves both as practice and as evidence of progress. In my view, supervised use is more realistic and educational than prohibition.',
      'The case for restriction is understandable. Homework is meant to show what a learner can explain independently, but an AI system can produce an essay within seconds. If students copy this output without questioning it, they may 既不理解论点，也无法展示自己的能力. Frequent dependence could also weaken the patience required for planning, drafting and revising. It may also make assessment unfair to classmates who complete the work independently. Schools therefore need clear boundaries, especially for assessed work.',
      'However, a total ban would ignore useful applications. AI can offer vocabulary prompts, identify unclear organisation and give students immediate practice when a teacher is unavailable. This support may be especially valuable for learners who receive little academic help at home. Teachers should therefore 要求学生说明自己如何使用这些工具并核实可疑信息. Assignments can also include personal reflection, classroom discussion and staged drafts, making the learning process visible. Used this way, the technology supports decisions made by the learner instead of replacing them.',
      'In conclusion, generative AI should be treated as a supervised learning aid rather than either a shortcut or a forbidden technology. Schools should protect independent thinking while teaching students to use new tools critically, transparently and responsibly.',
    ),
  ),
  demoDocument(
    'demo-public-transport',
    'Some people think governments should spend more money on public transport than on roads. Discuss both views and give your own opinion.',
    completeEssay(
      'Governments face constant pressure to improve transport while budgets remain limited. Some people believe roads deserve more investment because private vehicles and freight remain essential. Others argue that public transport should receive the larger share. The decision shapes not only journey times but also housing patterns, air quality and access to opportunity. I agree with the second view, although maintaining important roads is still necessary.',
      'The strongest argument for public transport is that reliable buses and railways can 缓解交通拥堵 while moving far more people through crowded areas. Frequent services also reduce air pollution and the amount of urban land used for parking. Affordable networks can 让低收入居民更容易获得工作、教育和医疗服务, which makes transport policy a matter of social fairness as well as efficiency. When stations connect with safe walking and cycling routes, the entire journey becomes more convenient.',
      'Road supporters correctly note that emergency services, delivery companies and rural communities cannot depend entirely on trains. Damaged roads can isolate small towns and increase the cost of essential goods. Governments should therefore repair unsafe routes and protect key freight connections. Nevertheless, 只修建更多道路往往只能带来短期缓解，因为新增容量会鼓励更多人开车. In dense cities, this eventually recreates the same congestion. Wider roads can also divide neighbourhoods and consume land that could support homes or public spaces.',
      'In conclusion, road maintenance should continue where it supports safety and essential access, but most new investment should make shared transport frequent, affordable and well connected. Funding decisions should reflect the different needs of urban and rural areas rather than follow one national formula. This balance would improve mobility without encouraging ever greater dependence on private cars.',
    ),
  ),
  demoDocument(
    'demo-digital-services',
    'More public services are now provided mainly through websites and mobile applications. What problems can this create, and what measures could address them?',
    completeEssay(
      'Online public services can reduce queues, lower administrative costs and allow citizens to complete routine tasks at any time. Digital records can also help different agencies coordinate a case more quickly. However, making websites and applications the main route to healthcare, housing or financial support can deepen the 数字鸿沟. The central challenge is to gain efficiency without excluding the people who need public help most.',
      'Access is unequal for several reasons. Some older adults have limited confidence with unfamiliar interfaces, while low-income households may share one device or rely on unstable internet connections. 当申请流程只在线上进行时，缺乏数字技能、辅助设备或稳定网络的人可能被排除在基本公共服务之外. Poorly designed identity checks can create further barriers for people with disabilities or unusual personal circumstances. A single technical error may then delay rent support, medical appointments or other urgent assistance.',
      'Governments should respond by making digital services simple, accessible and easy to pause and resume. Instructions should use plain language, and staff should be able to view the same case across different channels. Even when online systems work well, agencies should 保留面对面和电话渠道 for citizens who need personal assistance. Libraries and community centres can also provide secure devices and practical guidance. Regular testing with disabled and older users would reveal problems before a service is launched nationally.',
      'In conclusion, digital delivery is valuable, but convenience for the majority must not become exclusion for a vulnerable minority. A fair system offers several routes to the same service and allows people to move between them without starting again. Governments should measure success by whether citizens complete their tasks, not simply by how many forms have moved online.',
    ),
  ),
  demoDocument(
    'demo-remote-work',
    'Some people believe working from home improves employees’ quality of life. Others argue that working together in the same place is better. Discuss both views and give your opinion.',
    completeEssay(
      'The rapid expansion of remote work has changed how employees judge a good job. Working from home can offer autonomy and save time, while offices support spontaneous communication and a shared culture. The best arrangement depends on the employee, the home environment and the work being performed. In my view, neither location is ideal for every task, so a carefully designed hybrid model is the strongest approach.',
      'Remote work can 帮助员工保持工作与生活的平衡 by removing long commutes and giving people more control over routine responsibilities. It also enables organisations to recruit talented employees who live far from major cities. For focused tasks, a quiet home environment may be more productive than a busy open-plan office. Employees may use the time saved from travel for exercise, family care or adequate rest.',
      'However, distance has real costs. New employees may struggle to learn informally, and complex disagreements can take longer to resolve online. 即使员工节省了通勤时间，他们也可能因为工作与私人生活的界限模糊而感到疲惫. Employers must therefore set realistic hours and avoid treating home-based staff as permanently available. Regular face-to-face meetings can strengthen trust and reduce isolation. Companies must also ensure that remote staff are not overlooked for training or promotion.',
      'A practical hybrid policy should 根据任务性质决定何时远程工作、何时面对面协作 rather than impose the same schedule on every team. Staff should have suitable equipment and enough notice to organise office days. In conclusion, flexibility improves quality of life only when it is supported by clear expectations, fair access and purposeful opportunities to work together.',
    ),
  ),
  demoDocument(
    'demo-household-waste',
    'Some people think individuals are mainly responsible for reducing household waste, while others believe governments and businesses should take the lead. Discuss both views and give your opinion.',
    completeEssay(
      'Household waste is often presented as the result of careless consumer choices. Individuals certainly influence what they buy, reuse and discard, but they do not control how products are designed or packaged. Waste is therefore produced by a chain of decisions involving manufacturers, retailers, governments and households. I believe responsibility should be shared, with governments and businesses taking the lead in making low-waste choices practical.',
      'Consumers can avoid disposable goods, repair useful items and separate recyclable materials. These habits matter because even a well-designed collection system fails when households ignore it. Education and clear labels can help people understand what belongs in each bin. Nevertheless, personal effort alone cannot remove unnecessary packaging from shops or make fragile products last longer. Sustainable options may also cost more or be unavailable in some neighbourhoods.',
      'A durable policy needs 生产者责任, because difficult packaging can 增加处理成本并把负担转嫁给家庭. Governments can require recyclable materials, charge companies for hard-to-process waste and set minimum standards for repairability. Producers would then have a financial reason to offer refill systems and longer-lasting goods. Retailers could support this change by accepting returned containers and displaying repair information clearly.',
      'Local infrastructure is equally important. Asking families to sort more rubbish will have limited effect 如果地方政府没有提供方便且一致的回收系统. Collection rules should be stable across neighbouring areas, and food-waste services should reach apartment buildings as well as houses. In conclusion, policy should make producers accountable, give households reliable services and 让可持续选择成为最方便的选择. Individual responsibility becomes effective only when the surrounding system supports it.',
    ),
  ),
  demoDocument(
    'demo-physical-education',
    'Some people think physical education should be a compulsory subject at school, while others believe academic subjects should receive more time. Discuss both views and give your opinion.',
    completeEssay(
      'Schools have limited teaching time, so every compulsory subject must justify its place. Some parents want greater emphasis on mathematics, science and languages because these subjects influence university entry. Others see physical education as 不可替代的一部分 of a balanced education. The debate is particularly important as many children now spend more time sitting and using screens. I agree that physical education should remain compulsory, provided lessons are inclusive and purposeful.',
      'Academic subjects clearly matter for future study and employment. Students who fall behind may need extra classroom time, and schools should not reduce essential literacy or numeracy teaching. However, 如果学校只重视考试成绩，学生可能会失去锻炼身体、学习团队合作和缓解压力的固定机会. Regular movement can improve concentration and establish habits that protect health beyond the school years. Team activities also teach communication, resilience and respect for shared rules.',
      'Compulsory physical education should not mean forcing every student into the same competitive sport. Schools can offer swimming, dance, athletics, walking and strength exercises, allowing pupils to discover activities they can continue as adults. Teachers should 根据学生年龄、能力和健康状况调整活动强度, while assessing effort, knowledge and progress rather than natural athletic ability. Students with disabilities should receive adapted activities instead of being excluded from the lesson.',
      'Time can be protected by scheduling several focused sessions each week rather than allowing sport to displace core lessons unpredictably. Schools can also connect health knowledge with science and personal development classes. In conclusion, academic learning and physical wellbeing should not be treated as rivals. A consistent physical education programme gives every child access to exercise and social learning while leaving sufficient time for demanding academic subjects.',
    ),
  ),
  demoDocument(
    'demo-tourism-limits',
    'International tourism brings economic benefits, but it can also damage local communities and the environment. Do the advantages outweigh the disadvantages?',
    completeEssay(
      'International tourism creates employment, supports small businesses and helps fund cultural sites. Yet popular destinations can suffer overcrowding, rising housing costs and environmental damage. Whether tourism is beneficial therefore depends less on its size than on how it is managed. In my view, the advantages outweigh the disadvantages only when visitor numbers remain within a destination’s 环境承载能力 and local communities share the benefits.',
      'Tourism income can diversify economies that previously depended on one industry. Hotels, restaurants, transport providers and guides all create jobs, while entrance fees can finance the protection of historic buildings and natural areas. Contact with visitors may also encourage cultural exchange and give traditional crafts a wider market. In remote regions, responsible tourism can create employment without requiring young residents to leave their communities.',
      'The disadvantages become serious when growth is unmanaged. 如果游客数量增长得太快，当地居民可能承担更高的租金、拥挤的公共空间和更大的垃圾处理压力，而得到的收益却很少. Fragile ecosystems may also be damaged by construction, traffic and excessive water use. Seasonal jobs can be insecure, and profits may leave the region through international companies. These costs can eventually make a destination less attractive to both residents and visitors.',
      'Governments should cap development in sensitive areas, regulate short-term rentals and 把旅游收入的一部分直接投入公共交通、环境保护和社区服务. Local residents should participate in planning and receive support to operate their own businesses. Visitor fees can be higher during peak periods to spread demand across seasons. In conclusion, tourism can be beneficial, but success should be measured by long-term local wellbeing rather than by visitor numbers alone.',
    ),
  ),
  demoDocument(
    'demo-ageing-society',
    'In many countries, the proportion of older people is increasing. What problems can this cause, and what measures could governments take?',
    completeEssay(
      'Longer life expectancy is a major social achievement, but an ageing population can place pressure on healthcare, pensions and family support. At the same time, older citizens contribute experience, childcare and voluntary work that simple cost calculations often ignore. The challenges are manageable if governments plan early, invest in 预防性医疗 and help older people remain active participants in their communities.',
      'The first difficulty is financial. A smaller working-age population may have to support more retirees, while chronic illnesses increase demand for long-term care. 随着老年人口增加，如果医疗系统仍然主要在病情严重后才介入，医院和家庭照护者都将承受更大压力. Social isolation can create an additional burden because older adults who live alone may lose regular contact and practical help. Families may reduce their working hours to provide care, affecting both household income and the wider economy.',
      'Governments should encourage healthy ageing through accessible exercise programmes, routine screening and earlier management of chronic conditions. Pension reform may also be necessary, but changes should be gradual and protect people in physically demanding occupations. Flexible part-time work can allow those who wish to remain employed to contribute without facing a sudden retirement deadline. Housing, transport and community services should be designed to 让老年人尽可能长时间保持独立生活.',
      'Local clinics, social groups and reliable public transport can prevent small difficulties from becoming emergencies. Support for professional carers and short breaks for family carers would also improve the quality of long-term care. In conclusion, population ageing does not have to produce a crisis. Preventive health services, sustainable retirement policies and age-friendly neighbourhoods can reduce costs while respecting older people’s independence and experience.',
    ),
  ),
  originalPromptDocument(
    'demo-practical-skills',
    'original-education-practical-skills-v1',
    completeEssay(
      'Secondary schools are expected to prepare young people for further study, employment and adult life. Some people therefore want more classroom time devoted to managing money, cooking and other practical abilities, even if this reduces time for traditional subjects. I agree that life skills deserve a regular place in the curriculum, but they should complement rather than replace strong academic foundations.',
      'Mathematics, science, languages and the humanities develop knowledge that students need for university and skilled work. Basic literacy and numeracy remain 学习其他学科的基础. These subjects also train students to analyse evidence, communicate clearly and understand unfamiliar problems. Reducing them too sharply would particularly disadvantage pupils who cannot obtain academic support outside school.',
      'However, many teenagers leave school without knowing how to 制定预算、比较借贷成本或准备营养均衡的简单餐食. These are not minor domestic tasks: poor financial decisions can create long-term debt, while basic cooking knowledge supports health and independence. 即使实用课程不能覆盖成年生活中的每一种情况，它们也能让学生在第一次独立做决定时更有信心. Lessons could use realistic projects such as planning a weekly food budget, reading a rental agreement or comparing the total cost of different payment plans.',
      'Schools do not need to choose one form of learning at the expense of the other. Practical projects can apply mathematics, reading and scientific knowledge to situations students recognise, while local professionals can contribute occasional workshops without replacing trained teachers. In conclusion, a balanced timetable should protect demanding academic study and also give every student repeated opportunities to practise the decisions that independent adults make.',
    ),
  ),
  originalPromptDocument(
    'demo-university-breadth',
    'original-education-major-breadth-v1',
    completeEssay(
      'University students invest substantial time and money in their education, so it is reasonable to ask whether every course should serve a future career. Some people favour narrow specialisation, while others believe students should explore subjects beyond their main field. In my view, a degree needs a clear academic core, but carefully chosen outside courses make graduates more adaptable and thoughtful.',
      'Specialisation allows students to build the depth required in fields such as engineering, medicine and law. Employers must be able to trust that graduates have mastered essential methods rather than sampled many unrelated topics. A crowded timetable can also create stress and prevent students from completing demanding laboratory, studio or placement work. Universities should therefore guarantee enough time for the central requirements of each programme.',
      'Breadth still has important value. Courses in history, design or statistics can 培养跨学科思维 and help students recognise assumptions within their own discipline. 即使某门选修课与毕业后的第一份工作没有直接关系，它也可能帮助学生理解不同背景的人如何看待同一个问题. This matters because modern challenges rarely fit within one department. A software developer may need to understand ethics, while a public-health specialist may benefit from communication and data visualisation.',
      'The best policy is structured choice rather than unrestricted choice. Universities should 允许学生用一小部分学分探索主修领域之外的课程，同时确保核心能力得到充分训练. Academic advisers can help students select options that broaden their perspective without delaying graduation. In conclusion, career preparation and intellectual breadth are not opposites: a strong specialist who can connect ideas across fields is often better prepared for both work and citizenship.',
    ),
  ),
  originalPromptDocument(
    'demo-family-home',
    'original-society-family-home-v1',
    completeEssay(
      'In many cities, young adults now remain in the parental home well into their twenties or thirties. This pattern is often described as a decline in independence, but it is mainly a response to economic conditions and changing family expectations. I believe it can be positive when it is based on choice, shared responsibility and a realistic plan for the future.',
      'Housing is the strongest cause. High rents and insecure early-career employment make it difficult for young workers to 攒够首付款. 当工资增长速度长期低于房租和房价上涨速度时，即使全职工作的人也可能无法负担独立住房. Longer education and unpaid internships can delay stable income further. In cities where transport links are concentrated around expensive centres, moving farther away may also create long and costly commutes.',
      'Living together can benefit both generations. Adult children may contribute to bills, share household work and 帮助照顾年幼或年长的家庭成员. Parents can provide emotional support while young adults build savings or complete training. Nevertheless, the arrangement becomes harmful if family members avoid discussing privacy, money and expectations. Young adults should still make their own decisions and take a fair share of practical responsibility.',
      'The wider solution is not to pressure people to leave home before they can afford it. Governments should increase the supply of secure rental housing and improve transport from lower-cost areas, while employers should offer predictable entry-level work. Families can agree on contributions and review the arrangement regularly. In conclusion, living with parents for longer is neither automatically a failure nor an ideal; its value depends on whether it supports gradual independence rather than postponing it indefinitely.',
    ),
  ),
  originalPromptDocument(
    'demo-local-community',
    'original-society-local-community-v1',
    completeEssay(
      'Large cities place millions of people close together, yet many residents barely know those living nearby. Long working hours, frequent moves and buildings without shared spaces all weaken everyday contact. Stronger local communities can be encouraged, but successful measures must make repeated, low-pressure interaction part of ordinary life rather than rely on occasional public events.',
      'Time and mobility are central causes. Residents who commute long distances may return home too tired to 与邻居建立稳定联系. 当租户频繁搬家、公共空间又缺乏舒适的停留区域时，人们很难通过反复见面建立信任. Online entertainment and delivery services also reduce the small encounters that once happened in local shops. Fear of disturbing strangers can then become self-reinforcing, because nobody wants to be the first person to start a conversation.',
      'Urban design can create better conditions for contact. Local authorities can 把闲置空间改造成小型花园、共享工作区和儿童活动场所, giving residents practical reasons to meet. Libraries, schools and sports centres can host regular groups led by local volunteers. Events should be affordable and predictable so that relationships develop over time. Building managers can also provide noticeboards and simple digital channels for sharing tools, reporting problems or organising help.',
      'Community activity cannot be forced, and some residents will reasonably prefer privacy. The aim should be to offer welcoming opportunities rather than demand constant participation. Councils can support small resident-led projects with modest grants and help groups reach newcomers in several languages. In conclusion, neighbourly trust grows from repeated useful contact; cities should therefore protect the places, time and local institutions that allow such contact to occur naturally.',
    ),
  ),
  demoDocument(
    DEMO_RECALL_DOCUMENT_ID,
    'Universities are moving student services such as course registration and financial support online. Do the advantages outweigh the disadvantages?',
    '',
  ),
];

const [aiRulesSentence, aiLearningSentence, aiDisclosureSentence] = findMixedSentences(DEMO_DOCUMENTS[0].essay);
const [congestionSentence, transportAccessSentence, roadCapacitySentence] = findMixedSentences(DEMO_DOCUMENTS[1].essay);
const [digitalDivideSentence, digitalExclusionSentence, offlineChannelsSentence] = findMixedSentences(DEMO_DOCUMENTS[2].essay);
const [workLifeSentence, remoteConcessionSentence, hybridPolicySentence] = findMixedSentences(DEMO_DOCUMENTS[3].essay);
const [producerResponsibilitySentence, recyclingConditionSentence, sustainableChoiceSentence] = findMixedSentences(DEMO_DOCUMENTS[4].essay);
const [peValueSentence, academicPressureSentence, inclusiveActivitySentence] = findMixedSentences(DEMO_DOCUMENTS[5].essay);
const [tourismCapacitySentence, tourismCostSentence, tourismRevenueSentence] = findMixedSentences(DEMO_DOCUMENTS[6].essay);
const [preventiveCareSentence, ageingPressureSentence, independentLivingSentence] = findMixedSentences(DEMO_DOCUMENTS[7].essay);
const [academicFoundationSentence, practicalSkillsSentence, practicalConfidenceSentence] = findMixedSentences(DEMO_DOCUMENTS[8].essay);
const [interdisciplinarySentence, outsideCourseSentence, structuredChoiceSentence] = findMixedSentences(DEMO_DOCUMENTS[9].essay);
const [depositSentence, housingPressureSentence, familyCareSentence] = findMixedSentences(DEMO_DOCUMENTS[10].essay);
const [neighbourContactSentence, repeatedContactSentence, sharedSpaceSentence] = findMixedSentences(DEMO_DOCUMENTS[11].essay);

const PROTOTYPE_ITEMS: Record<string, ScaffoldResult['items']> = {
  [aiRulesSentence.text]: [{ sourceZh: '在明确规则下使用', action: 'provide_expression', recommendedExpression: 'used within clear guidelines', scaffolds: [] }],
  [aiLearningSentence.text]: [{
    sourceZh: '既不理解论点，也无法展示自己的能力', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '不理解论点', recommendedExpression: 'fail to understand the argument' },
      { scaffoldId: 's2', focusZh: '无法展示自己的能力', recommendedExpression: 'be unable to demonstrate their own ability' },
    ],
  }],
  [aiDisclosureSentence.text]: [{
    sourceZh: '要求学生说明自己如何使用这些工具并核实可疑信息', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '要求学生说明', recommendedExpression: 'require students to explain' },
      { scaffoldId: 's2', focusZh: '如何使用这些工具', recommendedExpression: 'how they used these tools' },
      { scaffoldId: 's3', focusZh: '核实可疑信息', recommendedExpression: 'verify questionable information' },
    ],
  }],
  [congestionSentence.text]: [{ sourceZh: '缓解交通拥堵', action: 'provide_expression', recommendedExpression: 'ease traffic congestion', scaffolds: [] }],
  [transportAccessSentence.text]: [{
    sourceZh: '让低收入居民更容易获得工作、教育和医疗服务', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '让低收入居民更容易获得', recommendedExpression: 'give low-income residents easier access to' },
      { scaffoldId: 's2', focusZh: '工作、教育和医疗服务', recommendedExpression: 'jobs, education and healthcare' },
    ],
  }],
  [roadCapacitySentence.text]: [{
    sourceZh: '只修建更多道路往往只能带来短期缓解，因为新增容量会鼓励更多人开车', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '只修建更多道路', recommendedExpression: 'simply building more roads' },
      { scaffoldId: 's2', focusZh: '只能带来短期缓解', recommendedExpression: 'provides only short-term relief' },
      { scaffoldId: 's3', focusZh: '新增容量会鼓励更多人开车', recommendedExpression: 'the added capacity encourages more people to drive' },
    ],
  }],
  [digitalDivideSentence.text]: [{ sourceZh: '数字鸿沟', action: 'provide_expression', recommendedExpression: 'the digital divide', scaffolds: [] }],
  [digitalExclusionSentence.text]: [{
    sourceZh: '当申请流程只在线上进行时，缺乏数字技能、辅助设备或稳定网络的人可能被排除在基本公共服务之外', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '当申请流程只在线上进行时', recommendedExpression: 'when application processes are available only online' },
      { scaffoldId: 's2', focusZh: '缺乏数字技能、辅助设备或稳定网络的人', recommendedExpression: 'people who lack digital skills, assistive devices or reliable internet' },
      { scaffoldId: 's3', focusZh: '被排除在基本公共服务之外', recommendedExpression: 'be excluded from essential public services' },
    ],
  }],
  [offlineChannelsSentence.text]: [{ sourceZh: '保留面对面和电话渠道', action: 'provide_expression', recommendedExpression: 'retain face-to-face and telephone channels', scaffolds: [] }],
  [workLifeSentence.text]: [{ sourceZh: '帮助员工保持工作与生活的平衡', action: 'provide_expression', recommendedExpression: 'help employees maintain a healthy work-life balance', scaffolds: [] }],
  [remoteConcessionSentence.text]: [{
    sourceZh: '即使员工节省了通勤时间，他们也可能因为工作与私人生活的界限模糊而感到疲惫', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '即使员工节省了通勤时间', recommendedExpression: 'even if employees save commuting time' },
      { scaffoldId: 's2', focusZh: '工作与私人生活的界限模糊', recommendedExpression: 'the boundary between work and private life becomes blurred' },
      { scaffoldId: 's3', focusZh: '感到疲惫', recommendedExpression: 'feel exhausted' },
    ],
  }],
  [hybridPolicySentence.text]: [{
    sourceZh: '根据任务性质决定何时远程工作、何时面对面协作', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '根据任务性质决定', recommendedExpression: 'decide according to the nature of the task' },
      { scaffoldId: 's2', focusZh: '何时远程工作', recommendedExpression: 'when to work remotely' },
      { scaffoldId: 's3', focusZh: '何时面对面协作', recommendedExpression: 'when to collaborate face to face' },
    ],
  }],
  [producerResponsibilitySentence.text]: [
    { sourceZh: '生产者责任', action: 'provide_expression', recommendedExpression: 'producer responsibility', scaffolds: [] },
    {
      sourceZh: '增加处理成本并把负担转嫁给家庭', action: 'offer_scaffolds', recommendedExpression: null,
      scaffolds: [
        { scaffoldId: 's1', focusZh: '增加处理成本', recommendedExpression: 'increase disposal costs' },
        { scaffoldId: 's2', focusZh: '把负担转嫁给家庭', recommendedExpression: 'shift the burden onto households' },
      ],
    },
  ],
  [recyclingConditionSentence.text]: [{
    sourceZh: '如果地方政府没有提供方便且一致的回收系统', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '地方政府没有提供', recommendedExpression: 'local authorities fail to provide' },
      { scaffoldId: 's2', focusZh: '方便且一致的回收系统', recommendedExpression: 'convenient and consistent recycling systems' },
    ],
  }],
  [sustainableChoiceSentence.text]: [{ sourceZh: '让可持续选择成为最方便的选择', action: 'provide_expression', recommendedExpression: 'make the sustainable choice the easiest choice', scaffolds: [] }],
  [peValueSentence.text]: [{ sourceZh: '不可替代的一部分', action: 'provide_expression', recommendedExpression: 'an irreplaceable part', scaffolds: [] }],
  [academicPressureSentence.text]: [{
    sourceZh: '如果学校只重视考试成绩，学生可能会失去锻炼身体、学习团队合作和缓解压力的固定机会', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '如果学校只重视考试成绩', recommendedExpression: 'if schools focus only on examination results' },
      { scaffoldId: 's2', focusZh: '失去固定机会', recommendedExpression: 'lose a regular opportunity' },
      { scaffoldId: 's3', focusZh: '锻炼身体、学习团队合作和缓解压力', recommendedExpression: 'to exercise, learn teamwork and relieve stress' },
    ],
  }],
  [inclusiveActivitySentence.text]: [{ sourceZh: '根据学生年龄、能力和健康状况调整活动强度', action: 'provide_expression', recommendedExpression: 'adapt the intensity of activities to students’ age, ability and health', scaffolds: [] }],
  [tourismCapacitySentence.text]: [{ sourceZh: '环境承载能力', action: 'provide_expression', recommendedExpression: 'environmental carrying capacity', scaffolds: [] }],
  [tourismCostSentence.text]: [{
    sourceZh: '如果游客数量增长得太快，当地居民可能承担更高的租金、拥挤的公共空间和更大的垃圾处理压力，而得到的收益却很少', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '如果游客数量增长得太快', recommendedExpression: 'if visitor numbers grow too quickly' },
      { scaffoldId: 's2', focusZh: '当地居民承担更高租金、拥挤空间和垃圾处理压力', recommendedExpression: 'local residents bear higher rents, crowded spaces and greater pressure on waste services' },
      { scaffoldId: 's3', focusZh: '得到的收益却很少', recommendedExpression: 'receive little of the benefit in return' },
    ],
  }],
  [tourismRevenueSentence.text]: [{
    sourceZh: '把旅游收入的一部分直接投入公共交通、环境保护和社区服务', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '把旅游收入的一部分直接投入', recommendedExpression: 'direct a share of tourism revenue into' },
      { scaffoldId: 's2', focusZh: '公共交通、环境保护和社区服务', recommendedExpression: 'public transport, environmental protection and community services' },
    ],
  }],
  [preventiveCareSentence.text]: [{ sourceZh: '预防性医疗', action: 'provide_expression', recommendedExpression: 'preventive healthcare', scaffolds: [] }],
  [ageingPressureSentence.text]: [{
    sourceZh: '随着老年人口增加，如果医疗系统仍然主要在病情严重后才介入，医院和家庭照护者都将承受更大压力', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '随着老年人口增加', recommendedExpression: 'as the older population grows' },
      { scaffoldId: 's2', focusZh: '医疗系统主要在病情严重后才介入', recommendedExpression: 'health systems intervene mainly after conditions become severe' },
      { scaffoldId: 's3', focusZh: '医院和家庭照护者承受更大压力', recommendedExpression: 'hospitals and family carers face greater pressure' },
    ],
  }],
  [independentLivingSentence.text]: [{ sourceZh: '让老年人尽可能长时间保持独立生活', action: 'provide_expression', recommendedExpression: 'enable older people to live independently for as long as possible', scaffolds: [] }],
  [academicFoundationSentence.text]: [{ sourceZh: '学习其他学科的基础', action: 'provide_expression', recommendedExpression: 'the foundation for learning other subjects', scaffolds: [] }],
  [practicalSkillsSentence.text]: [{
    sourceZh: '制定预算、比较借贷成本或准备营养均衡的简单餐食', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '制定预算', recommendedExpression: 'create a budget' },
      { scaffoldId: 's2', focusZh: '比较借贷成本', recommendedExpression: 'compare borrowing costs' },
      { scaffoldId: 's3', focusZh: '准备营养均衡的简单餐食', recommendedExpression: 'prepare simple, nutritionally balanced meals' },
    ],
  }],
  [practicalConfidenceSentence.text]: [{
    sourceZh: '即使实用课程不能覆盖成年生活中的每一种情况，它们也能让学生在第一次独立做决定时更有信心', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '即使实用课程不能覆盖成年生活中的每一种情况', recommendedExpression: 'even if practical courses cannot cover every situation in adult life' },
      { scaffoldId: 's2', focusZh: '让学生在第一次独立做决定时', recommendedExpression: 'help students when making independent decisions for the first time' },
      { scaffoldId: 's3', focusZh: '更有信心', recommendedExpression: 'feel more confident' },
    ],
  }],
  [interdisciplinarySentence.text]: [{ sourceZh: '培养跨学科思维', action: 'provide_expression', recommendedExpression: 'develop interdisciplinary thinking', scaffolds: [] }],
  [outsideCourseSentence.text]: [{
    sourceZh: '即使某门选修课与毕业后的第一份工作没有直接关系，它也可能帮助学生理解不同背景的人如何看待同一个问题', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '即使某门选修课与毕业后的第一份工作没有直接关系', recommendedExpression: 'even if an elective has no direct connection to a graduate’s first job' },
      { scaffoldId: 's2', focusZh: '帮助学生理解', recommendedExpression: 'help students understand' },
      { scaffoldId: 's3', focusZh: '不同背景的人如何看待同一个问题', recommendedExpression: 'how people from different backgrounds view the same issue' },
    ],
  }],
  [structuredChoiceSentence.text]: [{
    sourceZh: '允许学生用一小部分学分探索主修领域之外的课程，同时确保核心能力得到充分训练', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '允许学生用一小部分学分', recommendedExpression: 'allow students to use a small share of their credits' },
      { scaffoldId: 's2', focusZh: '探索主修领域之外的课程', recommendedExpression: 'to explore courses outside their major' },
      { scaffoldId: 's3', focusZh: '确保核心能力得到充分训练', recommendedExpression: 'while ensuring core skills are thoroughly developed' },
    ],
  }],
  [depositSentence.text]: [{ sourceZh: '攒够首付款', action: 'provide_expression', recommendedExpression: 'save enough for a deposit', scaffolds: [] }],
  [housingPressureSentence.text]: [{
    sourceZh: '当工资增长速度长期低于房租和房价上涨速度时，即使全职工作的人也可能无法负担独立住房', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '当工资增长速度长期低于房租和房价上涨速度时', recommendedExpression: 'when wage growth remains below rising rents and house prices' },
      { scaffoldId: 's2', focusZh: '即使全职工作的人', recommendedExpression: 'even people in full-time employment' },
      { scaffoldId: 's3', focusZh: '无法负担独立住房', recommendedExpression: 'may be unable to afford a home of their own' },
    ],
  }],
  [familyCareSentence.text]: [{ sourceZh: '帮助照顾年幼或年长的家庭成员', action: 'provide_expression', recommendedExpression: 'help care for younger or older family members', scaffolds: [] }],
  [neighbourContactSentence.text]: [{ sourceZh: '与邻居建立稳定联系', action: 'provide_expression', recommendedExpression: 'build lasting connections with neighbours', scaffolds: [] }],
  [repeatedContactSentence.text]: [{
    sourceZh: '当租户频繁搬家、公共空间又缺乏舒适的停留区域时，人们很难通过反复见面建立信任', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '当租户频繁搬家', recommendedExpression: 'when tenants move frequently' },
      { scaffoldId: 's2', focusZh: '公共空间又缺乏舒适的停留区域时', recommendedExpression: 'and shared spaces lack comfortable places to linger' },
      { scaffoldId: 's3', focusZh: '人们很难通过反复见面建立信任', recommendedExpression: 'it is difficult for people to build trust through repeated encounters' },
    ],
  }],
  [sharedSpaceSentence.text]: [{
    sourceZh: '把闲置空间改造成小型花园、共享工作区和儿童活动场所', action: 'offer_scaffolds', recommendedExpression: null,
    scaffolds: [
      { scaffoldId: 's1', focusZh: '把闲置空间改造成', recommendedExpression: 'convert unused spaces into' },
      { scaffoldId: 's2', focusZh: '小型花园、共享工作区', recommendedExpression: 'small gardens and shared workspaces' },
      { scaffoldId: 's3', focusZh: '儿童活动场所', recommendedExpression: 'play areas for children' },
    ],
  }],
};

export function createPrototypeResult(targetSentence: string): ScaffoldResult | null {
  const items = PROTOTYPE_ITEMS[targetSentence];
  return items
    ? {
        items,
        memoryMatchIds: [],
        meta: {
          requestId: crypto.randomUUID(),
          callCount: 1,
          latencyMs: 520,
          model: 'prototype-preview',
          promptVersion: 'expression-scaffold-v7-expression-memory-v1',
        },
      }
    : null;
}
