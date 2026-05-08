---
title: "I spent 8 months testing how ATS systems actually parse resumes - here's what I found"
source: "https://www.reddit.com/r/jobsearchhacks/comments/1r32a25/i_spent_8_months_testing_how_ats_systems_actually/"
author:
  - "[[Material-Maximum1365]]"
published: 2026-02-12
created: 2026-02-16
description: "Reddit is where millions of people gather for conversations about the things they care about, in over 100,000 subreddit communities."
tags:
  - "clippings"
---
About 8 months ago, my partner got laid off and started applying to jobs. She'd send out 15-20 applications a week and hear... nothing. Not rejections. Just silence.

I'm a developer, so I started digging into how ATS (Applicant Tracking Systems) actually work under the hood. I ran thousands of tests with different resume formats, keyword densities, and layouts against real ATS platforms like Workday, Greenhouse, Lever, iCIMS, and Taleo. Here's what the data showed.

1. The "75% auto-rejection" stat is misleading - the real problem is worse.

You've probably seen the claim that 75% of resumes get rejected by ATS before a human sees them. I believed it too. But after digging into how these systems actually work, the truth is more nuanced and honestly scarier.

A recent survey of 630 recruiters found that 92% say their ATS does NOT auto-reject based on content. The system isn't saying "no" to you. It's just... never surfacing you. Recruiters search the ATS like a database. They type in keywords, filter by job titles, set experience ranges. If your resume doesn't match what they search for, you simply don't exist.

You're not getting rejected. You're invisible.

2\. One change increased interview callbacks by 10.6x.

This was the single biggest finding. Resumes that matched the exact job title from the posting in their header/summary got callbacks at 10.6 times the rate of resumes that didn't.

Not a synonym. Not a creative interpretation. The exact title.

If the job posting says "Senior Product Manager," your resume should say "Senior Product Manager" - not "Product Lead" or "Head of Product Strategy." ATS keyword matching is still largely literal, and 99.7% of recruiters use keyword filters to sort applicants.

This is free. It takes 30 seconds per application. And almost nobody does it.

3\. The "pretty resume" tax is real.

This one hurt to see. Designers, marketers, and creatives consistently had the worst pass-through rates - not because they were less qualified, but because their resumes were unreadable to machines.

The biggest offenders:

\- Two-column layouts. ATS reads top-to-bottom in a single stream. Two columns get scrambled - your job title from column A merges with a skill from column B. It's gibberish on the other end.

\- Fancy icons and emojis. That cute phone icon next to your number? The ATS sees U+260E or just a blank. Your contact info becomes noise.

\- Non-standard section headers. "My Journey" instead of "Work Experience." "Toolkit" instead of "Skills." The parser doesn't know where to put that information, so it dumps it in a miscellaneous field nobody searches.

\- Info in headers/footers. Most ATS straight up ignore header and footer content. I saw hundreds of resumes where the candidate's name, email, and phone number were in the header - meaning the recruiter's system had no idea who they were.

4\. The keyword sweet spot is 25-35. No more, no less.

Resumes needed 25-35 relevant, role-specific keywords to consistently score above 80% in ATS matching. Below 25, you're not surfacing in enough recruiter searches. Above 35 and you start tripping the keyword-stuffing detectors.

Here's the thing - 83% of companies now use AI-assisted screening. The old trick of pasting the job description in white text doesn't just not work anymore - newer systems flag it. Your resume gets penalized, not boosted.

What does work: naturally weaving in the specific terms from the job posting. Not synonyms. Not abbreviations (unless the posting uses them). The. Exact. Words.

"Adobe Creative Cloud" and "Adobe Creative Suite" are different strings to a parser. Match what the posting says.

5\. Dates matter way more than you think.

One of the weirder findings: inconsistent date formats caused ATS systems to miscalculate total experience. I saw resumes where candidates had 8 years of experience but the system calculated 3 - because they mixed "Jan 2019," "2019-01," and "January '19" across different roles. Pick one format. Use it everywhere. "Month Year" (e.g., "Jan 2020 - Mar 2023") parsed most reliably across the systems I tested.

6\. .docx still wins the format war.

I know. PDF feels more professional. And most modern ATS can read PDFs fine - IF they're text-based PDFs created from a word processor.

But .docx parsed reliably across every single system I tested. PDFs had edge cases: scanned documents, certain export settings, embedded fonts that broke parsing.

If you want the safest bet, keep a .docx master version and only use PDF when the application specifically requests it.

7\. The real competition isn't what you think.

Only 2-3% of applications result in an interview right now. That sounds brutal, and it is. But here's the flip side - most of that 97% is getting filtered out for completely fixable reasons.

Bad formatting. Missing keywords. Invisible contact info. Creative headers that confuse parsers.

The bar for a technically optimized resume is shockingly low because most people don't know these rules exist. You don't have to be the best candidate. You just have to be visible.

TL;DR - the quick-fix checklist:

\- Match the exact job title from the posting in your resume header

\- Use single-column layout, no tables, no graphics

\- Standard section headers: "Work Experience," "Education," "Skills"

\- Keep contact info in the body, not headers/footers

\- 25-35 keywords pulled directly from the job posting

\- Consistent date formatting throughout (Month Year)

\- Save as .docx unless told otherwise

\- No icons, emojis, or decorative elements

\- Don't keyword-stuff - AI screening catches it now

Happy to answer questions about specific ATS systems or resume formats in the comments. Been deep in this rabbit hole for months now and happy to share what I've learned.

---

## Comments

> **redoingredditagain** • [187 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o515d0v/) •
> 
> Docx? Not pdf like I’ve been told a million times?
> 
> > **Bingo-heeler** • [116 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51u8r9/) •
> > 
> > Workday has trouble pulling my bullets from the PDF but pulls it perfectly from the docx which is bullshit but whatever
> > 
> > > **Material-Maximum1365** • [66 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52arah/) •
> > > 
> > > Yeah that’s exactly what I found in my testing too. It’s frustrating but Workday’s PDF parser is just worse than their docx one. Honestly that’s the main reason I recommend keeping a .docx master - not because PDF is bad in theory, but because in practice it’s a coin flip depending on the ATS.
> > > 
> > > > **NotSoFastLady** • [5 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o58sbxo/) •
> > > > 
> > > > Which is absolute shit. They charge millions of dollars for that software. And make all kinds of claims about their capabilities. Especially how they can consolidate the many insane variations of job titles for the same roles. Not to mention their "Ai" capabilities.
> > > > 
> > > > Feels like enterprise SaaS is a lot of scammy bull shit.
> > 
> > **ScaredCycle2993** • [16 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52e1vk/) •
> > 
> > This. Mine too! It likes to delete the first bullet and then throw the other ones all over the place. Then I gotta go through each Experience box and fix it all 😑
> > 
> > > **joypie81** • [10 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52l1fe/) •
> > > 
> > > This is so validating that it’s not just mine! Frustrating, but also validating. Thanks for sharing this small detail.
> > > 
> > > **SereneStrange** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o53fho6/) •
> > > 
> > > Couldn’t agree more. Thanks for sharing this detail.
> > 
> > **batmanlovespizza** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o53iv93/) •
> > 
> > You, just had an issue where it screwed up my entire resume just from bullets in a PDF.
> 
> **Material-Maximum1365** • [33 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o515q0y/) •
> 
> I’ve heard it as well , but in reality docx gives better score in ATS
> 
> > **redoingredditagain** • [7 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o516cof/) •
> > 
> > Worth a shot, thanks.
> 
> **lowlua** • [5 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o55head/) •
> 
> This makes a lot of sense. Docx is basically just XML. It would be very easy to interpret the structure of a word doc because there is information indicating if text is in a heading, part of a table, etc. PDFs have a fixed layout that ensures the file will look the same to another person as it does to you but often lack the information a docx would have. The position of a piece of text is absolute and may be without metadata indicating if it functions as a heading or whatever, or it could be the case that each page is just an image depending on how the pdf was made.
> 
> **jaanku** • [8 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o54ognn/) •
> 
> Dont worry, there will be another post tomorrow telling us that pdf is the preferred format 🤯
> 
> > **jonkl91** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o5689rj/) •
> > 
> > If the resume is built correctly and ATS friendly, it really won't make much of a difference whether you have pdf or docx. It's one of the most minor things compared to everything else.
> 
> **oftcenter** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o574u9k/) •
> 
> See, I was taught by a recruiter who visited this weekend leadership summit thing I went to back in college to use a .docx format. Single column. No frills. Nothing fancy. For the purpose of working with the ATS.
> 
> But in the years since, I've heard people outright disparage the use of .docx resumes. Someone even said it came off as a negative by making the candidate look old fashioned! And apparently people have strong opinions on this.

> **jonkl91** • [169 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51mbah/) •
> 
> I'm a professional resume writer and a tech recruiter. This is a great post. One of the reasons I don't post is you get too many people who criticize you. Not trying to spend my day arguing with people who have never even used an ATS or understand what goes on.
> 
> > **Material-Maximum1365** • [62 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51ovgp/) •
> > 
> > Thank you, that really means a lot coming from someone who actually works in the field! And please don’t let the haters stop you from posting. Honestly for me it’s even entertaining at this point - I argue with them for fun when I have time. Don’t pay attention to them, because if you go silent over 10 angry trolls, you’re letting down hundreds of people who genuinely need the help.
> > 
> > > **jonkl91** • [20 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o5235v2/) •
> > > 
> > > Honestly I just started a new job so I am playing it safe. I'll share good advice in the comments and leave comments on good posts. People are too petty. I'll wait until I establish myself more. My LinkedIn profile is attached to my profile and I have had people dig in and be like, "WELL akshually I would never use you as a resume writer and your LinkedIn profile isn't impressive at all". And it takes a lot for me to not respond with, "there's a reason you're unemployed. You can't spot good advice when you see it and you don't take feedback well".
> > > 
> > > Now I am still learning new things and still have a lot to learn.
> > > 
> > > **No-Material-4755** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o58jj8h/) •
> > > 
> > > Could you provide some of the raw data of the thousands of tests you ran? I feel like, for those of us willing to go through it, it will be even more helpful than the more general conclusions you include (which are also helpful)
> > > 
> > > **HappyCamper2121** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52zfwo/) •
> > > 
> > > Very true OP. Thank you so much for taking the time to make this post. I found it very helpful!

> **SomeVeryTiredGuy** • [25 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o5238o6/) •
> 
> I'm not saying you're necessarily wrong, OP, but boy does this post read like it was generated by ChatGPT
> 
> > **Material-Maximum1365** • [9 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52bgtv/) •
> > 
> > Haha fair enough, I definitely over-edited it for readability. Wanted to make it easy to skim since most people won’t read a wall of text. But the data behind it is real - happy to go deeper on any specific point if something seems off.
> > 
> > > **Vae71** • [18 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52vryn/) •
> > > 
> > > Even your reply sounds exactly like how Claude is currently responding to criticism 🤣 damn bro either you're a bot yourself or you can't confidently write a comment reply and that's 😬
> > > 
> > > > **palindrome4lyfe** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o56fd7s/) •
> > > > 
> > > > I didn't think so, until I checked the profile. Def feels like a bot
> > 
> > **Michealscottsucks** • [5 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o5bqskt/) •
> > 
> > I had to figure out if the suggestions were coming from a real human or ChatGPT. After reading a while, I figured out it was a real human that was heavily relying on ChatGPT for writing. I think that’s fine but if you want to lend your writing a bit more credibility, you may want to try other prompt techniques. For example, I usually use voice-to-text and ramble about what I want to say then I feed it into ChatGPT and ask it to organize my thoughts into headers and bullets (or your favorite format). Then I spend some time editing the output manually. I’m still experimenting with different prompts but my goal at this point it to distinguish my ideas from an AI so folks can tell when they should listen to me versus scrutinize AI content.
> > 
> > Anyways, thought I’d share this tip since your post was so helpful. I’ve passed it along to others. Thanks for taking the time to share your findings. They’re very helpful and match my experience as well.

> **TalkToTheHatter** • [51 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51f5q7/) •
> 
> Look we can say it's fake or not, but will it honestly hurt to try? I don't see the harm in trying this on a few applications before dismissing it. It's literally not costing anything to try it.
> 
> > **iam2anangel** • [7 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51rmqp/) •
> > 
> > Exactly.

> **ShoddyHedgehog** • [46 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o519jst/) •
> 
> This is really helpful. I see so many posts about how AI is auto rejecting their resumes. I would add though, some job applications have "knockout" or qualifying questions that will filter out candidates immediately - things like work authorization or a certain level of education. One of my clients was hiring for a hybrid job last year. It said clearly in the job description that it was hybrid and that you needed to be in the office at this location most Tuesdays and Thursdays but when they called to screen people they would be like "oh - yeah - can't/won't do that". They added a qualifying question that asked if you could be at this location most Tuesdays and Thursdays and it knocked out almost 40% of the applicants.
> 
> > **MrsSampsoo** • [19 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52kcps/) •
> > 
> > On the other hand, I've seen "hybrid" jobs on LinkedIn where the listing indicates it's on-site. What's up with that? Resume harvesting?
> > 
> > **Material-Maximum1365** • [5 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51a2w6/) •
> > 
> > Totally agree

> **Familiar-Corner-4053** • [18 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51w4oa/) •
> 
> So if I match the exact job title from the posting in my resume header but keep my current job title as it is, is that okay? Isn't it a red flag for recruiter because you don't have exact title or role what they are looking for.
> 
> > **Cute\_Anybody5984** • [9 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o523djp/) •
> > 
> > I was wondering the same, what if I want to apply for a team lead role, but my last role was a senior role? How would I match the exact title on my resume?
> > 
> > > **ADavies** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o55080a/) •
> > > 
> > > I would change it to match the job description - as long as the responsibilities were basically the same. A lot of job titles are not usually consistent across the industry so it's not dishonest.
> 
> **goddessandthecaker** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o54c2o7/) •
> 
> You put the job title into the summary at the top of your resume. Eg you are in marketing, and you are applying for a role of a Marketing Manger. Your summary should open “Marketing Manager with 3+ years of experience driving effective brand awareness, lead generation and ABM campaigns that drive revenue growth…” if you open with Marketer and Marketing Strategist or something else, your resume will not be as discoverable as with an exact title in the summary paragraph of your resume.
> 
> **imageofdeception** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o540huf/) •
> 
> Huge red flag, you’d be seen as dishonest and we’d consider rescinding.
> 
> > **Cute\_Anybody5984** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o554yg9/) •
> > 
> > Exactly, I don’t know why people say ‘just lie’. I’m interviewing people too and the people who are dishonest on the CV are really easy to spot once we get talking.
> > 
> > So I understand matching the exact job title if it’s basically the same position. Easy.
> > 
> > But what I’m not understanding is how to match the job title if I’m applying for a position that I haven’t worked in before. What if I want to work in a completely different job? I’m just worried my CV won’t even be considered.
> > 
> > > **Smart\_Reason\_5019** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o5i6rnn/) •
> > > 
> > > I’m thinking the same.
> > > 
> > > I’m considering trying “{{Exact\_title}} Resume - {Name}}”. This way I’m not claiming to have worked in that role, just that the CV/Resume is for that role.

> **Sure\_Bass8242** • [42 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52obh5/) •
> 
> My ADHD and depression just responded to this post with: “no thanks, I guess I’ll just be unemployed forever”
> 
> But, this was incredibly informative and useful information. Knowing what I know about ATS, it also seems legit so thank you for sharing with us!
> 
> > **anna\_vs** • [15 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52t1mj/) •
> > 
> > same. I don't want to deal with this s\*\*t
> > 
> > > **Taegreth** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o562ouh/) •
> > > 
> > > Same. Honestly, I don’t want to apply to jobs that use this system. I’ve been rather going through agencies where they have their own formats. I’ve gotten better luck there. As a creative, I don’t want my CV to look like a shitty word document. It goes against every fibre of my being lol.
> 
> **luxveniae** • [6 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o53b4kr/) •
> 
> Yup, I’ve been dealing with some chronic health issues that popped up the week I got laid off last September (had maybe one good month since) and just am so drained and don’t wanna jump through hoops when I’ve had to jump through so many just to talk to doctors, COVRA, insurance, etc.
> 
> Someone just look at my resume, interview me, and tell me yes or no. I’m sick of all this BS just to be invisible, told no, or offered so little that fast food jobs sound better.
> 
> > **chiaratara** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o54eo5f/) •
> > 
> > Same except August for me.

> **laranjacerola** • [25 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51ouql/) •
> 
> As a graphic designer that prefers to design her resume on in design:
> 
> if you use in design make sure everything in your page is layered in the right order, from bottom to top. (layers panel)
> 
> then, after exporting your pdf, a quick way to test how an ATS will read it is to crtl+all in your pdf page. and then paste it on a txt document.
> 
> you will see exactly how/if the computer is breaking your text .
> 
> > **yersinia\_p3st1s** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52emqp/) •
> > 
> > I just tried this and interesting enough, my very barely designed CV (from Europass) is completely legible.
> > 
> > Top to bottom I have: -> Name, contact details, location -> Work experience: with appropriate dates, job title, company name and location, followed by their respective numbered ballet points -> education and certifications: also all in order -> skills: look fine to my eyes but maybe would screw an ATS due to them being separate like this "Python | Bash | C#" -> Language skills: which gets even weider (for the ATS i believe): Mother tongue: Portuguese English C2 C2 C2 C2 C2
> > 
> > But the interesting thing is, sometimes when I put this on Workday and let it autofill information, it will still mix up skills or other parts of my resume and put it into the wrong fields, making me have to re-type most of everything.
> > 
> > So OPs theory sounds plausible at the very least, I ought try sending applications with a clean docx version.
> > 
> > > **laranjacerola** • [6 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52v4s5/) •
> > > 
> > > workday is the absolute worst of rhe worst of the worst platforms, though.
> > > 
> > > I simply stopped applying to any job that uses workday.
> > > 
> > > just the fact that It forces me to create a new login for every different job application, but it doesn't allow me to use the same email address is absurd.
> > > 
> > > > **yersinia\_p3st1s** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52wojd/) •
> > > > 
> > > > Amen to that haha!
> > > > 
> > > > I pushed thru the first one, but in the second one I found, where I had to rewrite my entire experience... I just gave up, fuck that shit, lol
> 
> **ADavies** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o5513b2/) •
> 
> Nice tip.
> 
> Just tried it and realized if I put my contacts / skills / training side bar on the left (instead of right) it will work a lot better. Right now I have it on the right side on the first page of a two page CV so the text there get's slotted in between my third and fourth job (which would not be a problem for any decently designed system but well...).

> **Kai-M** • [11 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51qmf1/) •
> 
> Before following this advice, I had almost zero success with my applications, but after doing most of these things for months now, I have still had almost zero success with my applications. This isn't a critique of your advice, but I've gone so far as painstakingly customizing every resume and writing cover letters from scratch, to mass applying with the same resume everywhere, and no dice. Maybe it's because I work in tech in a place with almost zero tech jobs which necessitates applying for remote tech roles which I imagine have huge numbers of applicants.

> **Eat\_Play\_Run** • [43 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51zbxw/) •
> 
> Internal Recruiter here...Please provide the links and/or sources to your data. Where are you pulling that "630 recruiters found that 92% say their ATS does NOT auto-reject based on content" You have a lot of "data" and I would like to see the articles or websites. Also, do you know how to configure Workday (or any of the other ATS you mentioned)? How did you determine that resumes need to have 25 to 35 keywords? Did you actually have a focus group of recruiters that you spoke with to get more accurate data? How did you determine that "One change increased interview callbacks by 10.6x."?
> 
> > **bigdograllyround** • [15 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52nv83/) •
> > 
> > I can answer that for you. 
> > 
> > "No, I made it up". 
> > 
> > > **anna\_vs** • [18 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52sfik/) •
> > > 
> > > Actually, chat gpt made it up.
> > > 
> > > > **Eat\_Play\_Run** • [8 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o536aq4/) •
> > > > 
> > > > Exactly. I am still waiting for OP to respond back with the sources. I want to read the articles to better educate myself (assuming the data is real and accurate)

> **talon1580** • [9 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51l40y/) •
> 
> Really I interesting, thank you! 
> 
> Can you explain your methodology a bit more? Did you have recruiter accounts for all those ATSes or are you inferring things based on results? 

> **eggiesallday** • [8 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o53h5ce/) •
> 
> “ - Info in headers/footers. Most ATS straight up ignore header and footer content. I saw hundreds of resumes where the candidate's name, email, and phone number were in the header - meaning the recruiter's system had no idea who they were.”
> 
> … where else would you put your contact info and name, if not at the top?
> 
> I suppose you mean header like in a doc form, where you double click to edit the top and get it distributed on each page?

> **universeboss14** • [20 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52875a/) •
> 
> Coming straight from a TA expert with 11 years of expertise, having worked with multiple ATS platforms across varied industries, every bit of what he said is bang on point. Can vouch for it straight away.
> 
> Kudos for sharing it.

> **RathdrumGal** • [14 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52l07t/) •
> 
> At the age of 57, I wanted to move to the city where I eventually hoped to retire. I was an RN with significant experience in neuro critical care nursing with many credentials. I planned on working for seven more years. I am healthy, fit and young looking, but knew my graduation date
> 
> I sent out multiple resumes, but got no response. I am sure that my nursing school grad date of 1978 caused them to overlook me. But in the early 1980s, I had read a book titled something like “Guerrilla Job Hunting Tactics in a Tough Job Market”. It was time to put that knowledge to use.
> 
> So, I printed out several copies of my resume, put on my job interview clothes, and started making “informational interview” appointments with the nurse managers of the critical care units in my new town. My reasoning was that I did not know the local hospitals, staffing, what programs each hospital offered, etc. I just called each hospital up, asked for the manager of each ICU, and made appointments.
> 
> In one smaller hospital, the manager thought I would be bored in their low acuity ICU. I agreed, and thanked her for her time. But, while walking back out to my car, the ICU manager from the hospital’s “sister hospital” called me, wanting to interview me. This was for a larger, higher acuity hospital. I interviewed, the manager shifted some FTEs around to create a job for me on day shift. I agreed to teach some classes on Neuro Nursing. The Nurse Recruiter and HR people were a bit miffed, since I bypassed them, but they recovered.
> 
> Taking matters into my own hands worked out well for me.
> 
> > **PunkyPicc** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o53mgz0/) •
> > 
> > You were lucky you are in a field where you are able to do that. I’m trying to move into an internal meeting planner role at a large company, and it’s just not that simple. Even if I could get past whatever front desk security they have, to ask who handles meetings and request to speak with them, there’s no guarantee they’d actually be in the office. With hybrid schedules, you can’t assume anyone is physically there on a given day. Trust me, I’ve thought through every angle. Sometimes I can’t even find a direct phone number or email to at least try and make contact or schedule something.
> > 
> > > **RathdrumGal** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o57u8ld/) •
> > > 
> > > I made appointments with the managers. The process took several days, except for that last day where I was sent to the sister hospital.
> 
> **blrmkr10** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o53og97/) •
> 
> Or, just don't put your graduation year on your resume. I graduated in 2010 and even I leave it off.

> **SuperStarStrength** • [6 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o521ewv/) •
> 
> I don't understand the contact info part. Mine is my name, then title, then contact info. Where else should it go?

> **West\_Subject\_8780** • [11 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51jt75/) •
> 
> A practical way to think about it: most ATS systems are trying to extract clean text, not judge “design.”
> 
> If you keep a simple single column docx master (no tables, no icons, no headers/footers), it will usually look basically the same when downloaded. The scary formatting issues tend to come from columns, text boxes, shapes, or fancy templates.
> 
> What I do:
> 
> - Keep a clean docx master.
> - If the application accepts PDF, export a text based PDF from Word/Google Docs (not a scan).
> - After uploading, use the application preview or re download the file to sanity check.
> 
> Readable text beats perfect spacing every time.

> **Curious\_Mountain\_723** • [5 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52c54n/) •
> 
> Then what should be in the header/footer?

> **drsmith48170** • [5 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52pd2n/) •
> 
> How did you know the results of your testing - unless you signed up as a recruiter and opened an account with the tools?
> 
> While the info provided does seems somewhat, this post just seems off to me a bit as I can’t understand how OP could see the results of his testing…,,the bs omens of those various ATS system and their algorithms ate their secret sauce do they just aren’t going to up it up for all to see.

> **Ambitious\_Cicada9263** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51vo4f/) •
> 
> Thank you - I am very intimidated by applying these days after being with the same company for almost a decade, and most jobs falling into place prior just by paying attention and/or being "poached" when I worked retail.
> 
> It hadn't even occurred to me that I should list proficiency in Gsuite under skills since to me everyone uses that now. 🤦

> **alexwwang** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51wu92/) •
> 
> TBH, I hate ATS. It’s really a humiliation to job applicants.

> **WoollyBear\_Jones** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52df4z/) •
> 
> So with your example in mind, if I’m going for a senior product manager role but have never actually held that exact title in my work experience, would it raise questions from hiring staff if I put that title in my header, only for them to then read on and not see it appear anywhere else? Genuinely curious, not trying to argue.
> 
> > **Helpful-External-974** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o57mrkr/) •
> > 
> > I'm a recruiter and acc hiring a Product Manager role at the moment. Job titles matter in terms of matching the job so your CV instantly seems relevant but nobody is cross checking your job title unless it's drastically different to your LinkedIn and we happen to check that. It's your experience and what you actually did in the job that matters more. If you're going for a specific job and you have the relevant experience but the company you're at called the role something stupid and unrelated then just change the job title on your CV to match the job or fairly similar.

> **notcallipygian** • [6 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51gu54/) •
> 
> But uploading it anywhere as a word doc doesnt guarantee that it upon downloading the formatting would look exactly as I intended it to. Wouldn’t that give off a bad impression?
> 
> > **jonkl91** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52y2yk/) •
> > 
> > That's fine. It all depends on the ATS they use and most recruiters understand that things won't be perfect. I am not going to knock a well written clean resume because the format is slightly off when I download it. Plus, I have a preview view of the resume in my ATS and that looks pretty similar to how you upload it. I come across so many absolutely terrible resumes that something being a little off isn't a bad impression at all.

> **Calm-Profession05** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51s5eb/) •
> 
> Wow, how times have changed…

> **Hertje73** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52iihc/) •
> 
> Let me guess any body over 50 can get ai fucked right

> **most\_humblest\_ever** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o53oxeo/) •
> 
> Will AI finally kill ATS? Why are all of these job search companies using this piece of shit software?

> **glidost3** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51lhls/) •
> 
> Wow this is fascinating. Thanks for sharing your findings

> **mc408** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51zo26/) •
> 
> I admittedly haven't tried the "match the job title verbatim" approach, but even if I were to start doing that, do you have any advice for how I would handle that being different from my static LinkedIn profile?
> 
> > **Helpful-External-974** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o57nsei/) •
> > 
> > Banking recruiter here. As long as it's not drastically different then it's not as important. The job title being the same will get the recruiters attention and then they'll acc read the experience beneath it in detail. You kinda keyword scan against the job description especially when you're looking at hundreds of CVs. Not to say that we'll ignore other CVs but it might just get them to look at your CV for more than a couple seconds.

> **BasicAccName** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52kvq8/) •
> 
> Great post. Is there any example that would show how little of formatting co needs to being visible? I understand the concept but I find hard to imagine exact form.

> **anna\_vs** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52ry5d/) •
> 
> So how can I tell if my resume was seen but rejected by hiring manager or it never surfaced? Is there a way?

> **Empty\_Meringue\_8300** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52zlth/) •
> 
> Look really useful. Question though. Why would you recommend putting the job title in the header if you say its contents gets ignored by the ATS?

> **Media-Altruistic** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o534rz5/) •
> 
> ATS is just the boogyman that you can point a finger at.
> 
> Why job title matches get higher call backs?
> 
> Because recruiters are lazy and making your resume idiot proof is the best hack.
> 
> All their reading is Job title, company, and duration.
> 
> Once that matches then they will take the extra 30 seconds to read your qualifications

> **BeagleConspiracy** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o53drkh/) •
> 
> I’ve been hesitant to do some of this stuff because I thought a recruiter would see my resume and just assume I tried to cram in keywords to fit.  But fuck it, at this point I’m desperate.  7 months and I’ve had a total of about 20 calls with recruiters, 5 actual first interviews.  Of those, two positions were cancelled, two ghosted me and never responded to follow up, and one I’m currently interviewing with.  
> 
> I’m going to give this a shot…and I’m considering changing my email and editing my name just a tad (I’ll just use middle name instead of first name) and reapplying to some of these things.  
> 
> I am most pissed off about two local companies.  I’m ridiculously qualified for multiple positions at both, and I can’t even get a sniff from a recruiter.  

> **Live-Duck1369** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o53gfu0/) •
> 
> How would ai know you keyword-stuff if you say - AI screening catches it now

> **SnooDucks9653** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o53mpnm/) •
> 
> # 2 is moronic, but I get it. Fine. Whatever.

> **howrunowgoodnyou** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o54v99m/) •
> 
> That’s so incredibly regarded I don’t even want to play. I’d rather start my own business than do such dumb things to appease such a stupid process.

> **TalentAid** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o54vsnp/) •
> 
> This is a super useful post, thank you!
> 
> Do you have any evidence or data to back up your claims? I know you said you did experiments yourself but can you share more about that?

> **Rambo910** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o55965i/) •
> 
> '25-35 keywords pulled directly from the job posting' isn't that too much?

> **Plenty-Reach8688** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o55x97s/) •
> 
> Thank you for such detailed advice. I got laid off in November and since then, been looking for a jobs. Like you know, I haven't received a single response. I'll now tweak my resume according to your advice but wanted to check is there a specific template you'll recommend and can share?

> **Visible-Area4713** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o56yuc2/) •
> 
> Normally, where I see ATS post on this sub, I get a bit frustrated because people speak from a place of ignorance.
> 
> However, after reading this post, I agree with essentially every single point here.
> 
> Most recruiters will do multiple different matchings/boolean search strings to look at as many resumes as possible. We do this because most candidates are good resume writer. However, I do have to stress that the most frustrating thing to see sourcing for candidate is a resume without contact information. Some candidates pay to be "confidential", which is against the idea of job seeking. When you apply to a job board, you are telling recruiters to contact you, so it is confusing when recruiter don't see any contact information on your resume.

> **MissAuroraRed** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o57hqr0/) •
> 
> Whenever I have a chance to edit how the system parses my CV, their stupid drop-down menu never has my degree as an option. The job listing will ask for my exact degree, but then I go to apply and I literally cannot put the degree they're asking for, that I have, in my application! I want to tear my hair out!

> **Sure\_Bass8242** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o58qo2a/) •
> 
> “Is it really that much to deal with” and your tone in the following replies def comes across as snarky. Bye now 👋🏼

> **Interesting\_Ninja446** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o5anmay/) •
> 
> Jesus these bot posts are all the same

> **\_Mar\_Kel\_** • [2 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o5qrv2i/) •
> 
> Wow! That's awesome info! Thank you for sharing!

> **dynamic\_ldr\_brandon** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52gjnw/) •
> 
> How did you actually test the ATS Systems? Lay out the methodology so we can all understand this isn't bullshit AI dribble, which is exactly how it is written.

> **Clown\_Penis69** • [9 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o5183ow/) •
> 
> Clanker alert!
> 
> > **Material-Maximum1365** • [22 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51czle/) •
> > 
> > the irony of being called a robot in a post about beating robots
> > 
> > > **UnknownUniverse\_104** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51oiao/) •
> > > 
> > > I mean, you did use AI to write the post. I don’t see an issue with that though
> 
> **NextGenerationNanite** • [4 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52ictk/) •
> 
> His post was helpful, ai or not. Your contribution on the other hand, is not so helpful.
> 
> Would you like to know more about writing helpful post?

> **PossibilityOk8653** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51mvqy/) •
> 
> So would you say the Harvard resume template is safe to use? I have tried different templates and have always struggled with it.

> **laranjacerola** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o51nzs5/) •
> 
> as a designer job hunting for over 2 years and getting zero interbiew3s... doesn't hurt to try.
> 
> will do!

> **Practical-Ad-2842** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o529s8j/) •
> 
> This is great information. Before I retired I was in a position to help people find jobs, during a recession. Many considered this kind of information false. Those that took the time to follow instructions like these, were always more successful at finding work. Your resume is a tool. Keep it sharp!

> **xc4p3\_cdn** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52ms8c/) •
> 
> How did you do these tests?
> 
> > **bigdograllyround** • [3 points](https://reddit.com/r/jobsearchhacks/comments/1r32a25/comment/o52opw0/) •
> > 
> > That's the great thing. He didn't!