
import React from 'react';
import Card from '../components/ui/Card';
import { SocialPlatform } from '../types'; // For mock data
import { APP_NAME } from '../constants';

// Mock Data
const mockKpis = {
  totalReach: { value: "125,670", change: "+15%", period: "last 30 days", icon: "fas fa-bullseye" },
  totalEngagement: { value: "8,940", change: "+12%", period: "last 30 days", icon: "fas fa-heart" },
  postsPublished: { value: "78", change: "+5", period: "last 30 days", icon: "fas fa-paper-plane" },
  followerGrowth: { value: "+1,230", period: "last 30 days", icon: "fas fa-users" },
};

const mockTopPosts = [
  { id: '1', snippet: "🚀 Our new eco-friendly product line just dropped! Check it out. #SustainableLiving #NewCollection", platform: SocialPlatform.Instagram, engagementRate: "7.2%", platformIcon: "fab fa-instagram" },
  { id: '2', snippet: "Join our webinar next week on the future of AI in marketing. Limited spots available! #AI #MarketingTips", platform: SocialPlatform.LinkedIn, engagementRate: "6.5%", platformIcon: "fab fa-linkedin" },
  { id: '3', snippet: "Quick update: Our X Space is happening tonight at 8 PM EST! Don't miss out on the discussion. #CommunityChat", platform: SocialPlatform.X, engagementRate: "5.8%", platformIcon: "fab fa-xing" }, // Using xing as a stand-in for X/Twitter
  { id: '4', snippet: "Fun Friday: What's your favorite way to unwind after a busy week? Share in the comments! #TGIF", platform: SocialPlatform.Facebook, engagementRate: "4.9%", platformIcon: "fab fa-facebook" },
];

const platformPerformanceData = [
    { platform: SocialPlatform.Facebook, engagement: 70, color: "text-blue-600", icon: "fab fa-facebook" },
    { platform: SocialPlatform.Instagram, engagement: 90, color: "text-pink-500", icon: "fab fa-instagram" },
    { platform: SocialPlatform.X, engagement: 60, color: "text-sky-500", icon: "fab fa-xing" }, // xing icon as placeholder
    { platform: SocialPlatform.LinkedIn, engagement: 75, color: "text-blue-700", icon: "fab fa-linkedin" },
    { platform: SocialPlatform.TikTok, engagement: 85, color: "text-black dark:text-white", icon: "fab fa-tiktok" },
];

const KpiCard: React.FC<{ title: string; value: string; change: string; period: string; icon: string; iconBgColor?: string }> = 
  ({ title, value, change, period, icon, iconBgColor = "bg-primary-500" }) => (
  <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
    <div className="flex items-start justify-between">
      <div>
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</h3>
        <p className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-1">{value}</p>
        <p className={`text-xs mt-1 ${change.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
          {change} <span className="text-slate-500 dark:text-slate-400">vs {period}</span>
        </p>
      </div>
      <div className={`p-3 rounded-full ${iconBgColor} text-white text-xl`}>
        <i className={icon}></i>
      </div>
    </div>
  </Card>
);

const AnalyticsPage: React.FC = () => {
  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold mb-8 text-slate-800 dark:text-slate-100">Social Media Analytics Overview</h1>

      {/* KPI Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KpiCard title="Total Reach" value={mockKpis.totalReach.value} change={mockKpis.totalReach.change} period={mockKpis.totalReach.period} icon={mockKpis.totalReach.icon} iconBgColor="bg-blue-500"/>
        <KpiCard title="Total Engagement" value={mockKpis.totalEngagement.value} change={mockKpis.totalEngagement.change} period={mockKpis.totalEngagement.period} icon={mockKpis.totalEngagement.icon} iconBgColor="bg-red-500"/>
        <KpiCard title="Posts Published" value={mockKpis.postsPublished.value} change={mockKpis.postsPublished.change} period={mockKpis.postsPublished.period} icon={mockKpis.postsPublished.icon} iconBgColor="bg-green-500"/>
        <KpiCard title="Follower Growth" value={mockKpis.followerGrowth.value} change="" period={mockKpis.followerGrowth.period} icon={mockKpis.followerGrowth.icon} iconBgColor="bg-purple-500"/>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card title="Engagement Over Time (Last 30 Days)">
          <div className="h-64 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-md flex items-center justify-center">
            {/* Simple SVG Line Chart Placeholder */}
            <svg width="100%" height="100%" viewBox="0 0 300 150" className="max-w-full">
              <line x1="20" y1="130" x2="280" y2="130" stroke="currentColor" strokeWidth="1"/> {/* X-axis */}
              <line x1="20" y1="20" x2="20" y2="130" stroke="currentColor" strokeWidth="1"/> {/* Y-axis */}
              <polyline points="30,100 80,80 130,110 180,60 230,75 270,50" fill="none" stroke="#3b82f6" strokeWidth="2"/>
              <text x="150" y="145" textAnchor="middle" fontSize="10" className="fill-current text-slate-600 dark:text-slate-400">Time</text>
              <text x="10" y="80" textAnchor="middle" transform="rotate(-90 10,80)" fontSize="10" className="fill-current text-slate-600 dark:text-slate-400">Engagement</text>
              <text x="150" y="20" textAnchor="middle" fontSize="12" className="fill-current text-slate-700 dark:text-slate-300">Placeholder Line Chart</text>
            </svg>
          </div>
        </Card>

        <Card title="Performance by Platform">
            <div className="h-64 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-md">
                <p className="text-center text-sm text-slate-600 dark:text-slate-400 mb-2">Engagement Score (Mock Data)</p>
                <div className="flex justify-around items-end h-full space-x-2">
                    {platformPerformanceData.map((p, index) => (
                        <div key={index} className="flex flex-col items-center flex-1">
                            <div 
                                className="w-full bg-primary-200 dark:bg-primary-700 rounded-t-md hover:opacity-80 transition-opacity"
                                style={{ height: `${p.engagement}%` }}
                                title={`${p.platform}: ${p.engagement}`}
                            >
                            </div>
                            <i className={`${p.icon} ${p.color} mt-2 text-xl`} title={p.platform}></i>
                        </div>
                    ))}
                </div>
            </div>
        </Card>
      </div>

      {/* Top Performing Content Section */}
      <Card title="Top Performing Content">
        <div className="space-y-4">
          {mockTopPosts.map(post => (
            <div key={post.id} className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <p className="text-sm text-slate-700 dark:text-slate-300 flex-1 pr-4">{post.snippet}</p>
                <div className="text-right flex-shrink-0">
                  <span className={`text-lg ${
                    post.platform === SocialPlatform.Instagram ? 'text-pink-600' :
                    post.platform === SocialPlatform.Facebook ? 'text-blue-600' :
                    post.platform === SocialPlatform.X ? 'text-sky-500' : // Using xing as color ref
                    post.platform === SocialPlatform.LinkedIn ? 'text-blue-700' :
                    'text-slate-500'
                  }`}>
                    <i className={post.platformIcon}></i>
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{post.platform}</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-primary-600 dark:text-primary-400 mt-2">Engagement Rate: {post.engagementRate}</p>
              {/* <Button variant="secondary" size="sm" className="mt-2 text-xs">View Post</Button> */}
            </div>
          ))}
        </div>
      </Card>
      
      <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-12">
        Note: All analytics data shown on this page is for demonstration purposes only and does not reflect real social media performance for {APP_NAME}.
      </p>
    </div>
  );
};

export default AnalyticsPage;
